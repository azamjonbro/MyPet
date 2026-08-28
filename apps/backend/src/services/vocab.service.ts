import { Types } from 'mongoose';
import {
  WORDS_IN_PROMPT,
  type AddWordsRequest,
  type StudyWord,
  type UpdateWordRequest,
  type WordListResponse,
} from '@pet/shared';
import { User, VocabItem, type VocabItemDoc } from '../models/index.js';
import { AppError } from '../utils/errors.js';
import { localDate } from '../utils/date.js';

/** Words a learner may track at once. Past this, a list stops being a plan. */
const MAX_LEARNING_WORDS = 300;

function normaliseKey(word: string): string {
  // "to postpone" and "Postpone" are the same word to a learner.
  return word.trim().toLowerCase().replace(/^to\s+/, '').replace(/\s+/g, ' ');
}

function toView(doc: VocabItemDoc): StudyWord {
  return {
    id: doc._id.toString(),
    word: doc.word,
    note: doc.note,
    definition: doc.definition,
    example: doc.example,
    source: doc.source as StudyWord['source'],
    status: doc.status as StudyWord['status'],
    timesUsed: doc.timesUsed,
    lastUsedAt: doc.lastUsedAt ? doc.lastUsedAt.toISOString() : null,
    addedOn: doc.localDate,
  };
}

export async function list(userId: string): Promise<WordListResponse> {
  const id = new Types.ObjectId(userId);
  const rows = await VocabItem.find({ userId: id }).sort({ status: 1, timesUsed: 1, createdAt: -1 });
  const words = rows.map(toView);
  return {
    words,
    counts: {
      learning: words.filter((w) => w.status === 'learning').length,
      known: words.filter((w) => w.status === 'known').length,
    },
  };
}

/**
 * Adds words the learner asked to learn.
 *
 * An existing word is not duplicated and not overwritten: if Mochi already
 * taught it, adding it keeps the definition and only takes the learner's note
 * and their claim on it. Re-adding a word marked "known" puts it back into
 * learning, which is the whole reason somebody would type it again.
 */
export async function addWords(userId: string, input: AddWordsRequest): Promise<WordListResponse> {
  const user = await User.findById(userId).select('timezone').lean();
  if (!user) throw AppError.notFound('That account no longer exists.');

  const today = localDate(user.timezone);
  const id = new Types.ObjectId(userId);

  const learning = await VocabItem.countDocuments({ userId: id, status: 'learning' });
  if (learning + input.words.length > MAX_LEARNING_WORDS) {
    throw AppError.validation(
      undefined,
      `That is more than ${MAX_LEARNING_WORDS} words at once. Mark some as known first.`,
    );
  }

  for (const item of input.words) {
    const key = normaliseKey(item.word);
    if (!key) continue;
    await VocabItem.updateOne(
      { userId: id, key },
      {
        $set: {
          status: 'learning',
          ...(item.note ? { note: item.note } : {}),
        },
        $setOnInsert: {
          userId: id,
          key,
          word: item.word.trim(),
          definition: '',
          example: '',
          source: 'learner',
          localDate: today,
        },
      },
      { upsert: true },
    );
  }

  return list(userId);
}

export async function updateWord(
  userId: string,
  wordId: string,
  patch: UpdateWordRequest,
): Promise<StudyWord> {
  if (!Types.ObjectId.isValid(wordId)) throw AppError.notFound('That word is not on your list.');
  const doc = await VocabItem.findOne({ _id: wordId, userId: new Types.ObjectId(userId) });
  if (!doc) throw AppError.notFound('That word is not on your list.');

  if (patch.status) doc.status = patch.status;
  if (patch.note !== undefined) doc.note = patch.note;
  await doc.save();
  return toView(doc);
}

export async function removeWord(userId: string, wordId: string): Promise<void> {
  if (!Types.ObjectId.isValid(wordId)) throw AppError.notFound('That word is not on your list.');
  await VocabItem.deleteOne({ _id: wordId, userId: new Types.ObjectId(userId) });
}

/** The words the tutor is told about: still being learned, least practised first. */
export async function wordsForPrompt(userId: string, limit = WORDS_IN_PROMPT): Promise<string[]> {
  const rows = await VocabItem.find({ userId: new Types.ObjectId(userId), status: 'learning' })
    .sort({ timesUsed: 1, createdAt: -1 })
    .limit(limit)
    .select('word')
    .lean();
  return rows.map((r) => r.word);
}

/**
 * Which of the learner's words appear in something they wrote.
 *
 * Deliberately a small, explainable matcher rather than a lemmatiser: it
 * lower-cases, splits on non-letters, and compares stems with the handful of
 * endings that matter in English. A learner who writes "postponed" has used
 * "postpone" and should be credited for it; one who writes "post" has not.
 *
 * Pure, and exported, because this is the rule that decides whether a mission
 * task advances — it deserves its own tests rather than being buried in a
 * database call.
 */
export function findUsedWords(text: string, words: string[]): string[] {
  const lower = text.toLowerCase();
  const tokens = lower.split(/[^a-z']+/).filter(Boolean);
  const stems = new Set(tokens.map(stem));

  const used: string[] = [];
  for (const word of words) {
    const key = normaliseKey(word);
    if (!key) continue;

    // A phrase ("look forward to") can only be matched as a phrase.
    if (key.includes(' ')) {
      if (lower.includes(key)) used.push(word);
      continue;
    }

    if (stems.has(stem(key))) used.push(word);
  }
  return used;
}

function stem(token: string): string {
  const word = token.replace(/'s$/, '');
  if (word.length <= 3) return word;
  if (word.endsWith('ies') && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith('ing') && word.length > 5) return restoreDouble(word.slice(0, -3));
  if (word.endsWith('ed') && word.length > 4) return restoreDouble(word.slice(0, -2));
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1);
  return word;
}

/** "stopped" -> "stop", "planning" -> "plan". Only for a doubled final consonant. */
function restoreDouble(base: string): string {
  const last = base.at(-1);
  const previous = base.at(-2);
  if (last && previous && last === previous && !'aeiou'.includes(last)) return base.slice(0, -1);
  return base;
}

/**
 * Records that the learner used these words, and returns how many were on the
 * list. Usage is what moves a word towards "known", so it is counted from
 * their own sentences and nowhere else.
 */
export async function recordUsage(
  userId: string,
  words: string[],
): Promise<void> {
  if (words.length === 0) return;
  const keys = words.map(normaliseKey);
  await VocabItem.updateMany(
    { userId: new Types.ObjectId(userId), key: { $in: keys } },
    { $inc: { timesUsed: 1 }, $set: { lastUsedAt: new Date() } },
  );
}
