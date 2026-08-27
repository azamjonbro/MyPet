import type { Correction, GrammarTopic, TutorReply } from '@pet/shared';
import type { LLMProvider, TutorRequest, TutorResult } from './provider.js';

/**
 * A deterministic, offline tutor.
 *
 * It exists for two reasons, both of which outlast the MVP:
 *   1. The project runs end to end with no OPENAI_API_KEY, so a new contributor
 *      can see the whole loop working on their first afternoon.
 *   2. Tests exercise the real tutor service — memory assembly, streaming,
 *      persistence, XP — without a network call or a bill.
 *
 * It is not a fallback for production. If a key is configured, this is unused.
 */

interface Rule {
  pattern: RegExp;
  topicId: GrammarTopic;
  fix: (m: RegExpMatchArray) => string;
  explanation: string;
  followUp: string;
  severity: 'minor' | 'major';
}

const RULES: Rule[] = [
  {
    pattern: /\b(goed)\b/i,
    topicId: 'PAST_SIMPLE_IRREGULAR',
    fix: () => 'went',
    explanation: 'Go is irregular. We say go → went → gone.',
    followUp: 'I ___ to the store yesterday. (go)',
    severity: 'major',
  },
  {
    pattern: /\b(eated|drinked|maked|taked|comed|buyed|thinked|teached|catched)\b/i,
    topicId: 'PAST_SIMPLE_IRREGULAR',
    fix: (m) => {
      const map: Record<string, string> = {
        eated: 'ate', drinked: 'drank', maked: 'made', taked: 'took', comed: 'came',
        buyed: 'bought', thinked: 'thought', teached: 'taught', catched: 'caught',
      };
      return map[m[1]!.toLowerCase()] ?? m[1]!;
    },
    explanation: 'This verb is irregular, so it does not take -ed.',
    followUp: 'Yesterday I ___ pizza. (eat)',
    severity: 'major',
  },
  {
    pattern: /\bdidn'?t\s+(went|ate|saw|took|came|made)\b/i,
    topicId: 'PAST_SIMPLE',
    fix: (m) => {
      const map: Record<string, string> = {
        went: 'go', ate: 'eat', saw: 'see', took: 'take', came: 'come', made: 'make',
      };
      return `didn't ${map[m[1]!.toLowerCase()] ?? m[1]!}`;
    },
    explanation: 'After didn\'t, the verb goes back to its base form.',
    followUp: "I didn't ___ the film. (see)",
    severity: 'major',
  },
  {
    pattern: /\bhow much\s+(books|people|apples|words|friends|things|cars|cats|dogs|students)\b/i,
    topicId: 'COUNTABLE_UNCOUNTABLE',
    fix: (m) => `how many ${m[1]}`,
    explanation: 'Many is for things we can count. Much is for things we cannot.',
    followUp: 'How ___ water do you drink? (much / many)',
    severity: 'major',
  },
  {
    pattern: /\bi\s+am\s+agree\b/i,
    topicId: 'VOCABULARY_CHOICE',
    fix: () => 'I agree',
    explanation: 'Agree is already a verb, so it does not need "am".',
    followUp: '___ with you. (agree)',
    severity: 'major',
  },
  {
    pattern: /\bi\s+have\s+(\d+)\s+years?\b/i,
    topicId: 'VOCABULARY_CHOICE',
    fix: (m) => `I am ${m[1]} years old`,
    explanation: 'In English we use "be" for age, not "have".',
    followUp: 'My sister ___ 15 years old. (be)',
    severity: 'major',
  },
  {
    pattern: /\b(he|she|it)\s+(go|make|do|take|want|like|need|work|live|play)\b(?!\w)/i,
    topicId: 'SUBJECT_VERB_AGREEMENT',
    fix: (m) => {
      const verb = m[2]!.toLowerCase();
      const third = verb === 'go' || verb === 'do' ? `${verb}es` : `${verb}s`;
      return `${m[1]} ${third}`;
    },
    explanation: 'With he, she and it we add -s to the verb.',
    followUp: 'She ___ to work at eight. (go)',
    severity: 'major',
  },
  {
    pattern: /\bmore\s+(better|worse|bigger|easier|faster)\b/i,
    topicId: 'COMPARATIVES_SUPERLATIVES',
    fix: (m) => m[1]!,
    explanation: 'This word is already a comparative. Never use both.',
    followUp: 'This one is ___ than that one. (good)',
    severity: 'minor',
  },
  {
    pattern: /\byesterday\s+i\s+(go|eat|see|make|take|come)\b/i,
    topicId: 'PAST_SIMPLE',
    fix: (m) => {
      const map: Record<string, string> = {
        go: 'went', eat: 'ate', see: 'saw', make: 'made', take: 'took', come: 'came',
      };
      return `yesterday I ${map[m[1]!.toLowerCase()] ?? m[1]!}`;
    },
    explanation: 'Yesterday is past time, so the verb must be past too.',
    followUp: 'Yesterday I ___ a good film. (see)',
    severity: 'major',
  },
  {
    pattern: /\bi\s+am\s+student\b/i,
    topicId: 'ARTICLES',
    fix: () => 'I am a student',
    explanation: 'Before a single countable noun we need "a".',
    followUp: 'She is ___ teacher. (a / an)',
    severity: 'minor',
  },
];

const PRAISE = [
  'Nice sentence!',
  'Good English!',
  'That is clear — well done.',
  'Great, keep going!',
];

const FOLLOW_UPS = [
  'Tell me more. Why?',
  'And how did you feel about that?',
  'Can you say that in two sentences?',
  'What happened next?',
  'Give me an example.',
];

/** Deterministic pick, so the same input always produces the same output in tests. */
function pick<T>(list: readonly T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return list[hash % list.length]!;
}

export function analyse(text: string): { corrections: Correction[]; followUp: string | null } {
  const corrections: Correction[] = [];
  let followUp: string | null = null;

  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    corrections.push({
      original: match[0],
      corrected: rule.fix(match),
      topicId: rule.topicId,
      explanation: rule.explanation,
      severity: rule.severity,
    });
    followUp ??= rule.followUp;
    if (corrections.length >= 4) break;
  }

  return { corrections, followUp };
}

export function createOfflineProvider(): LLMProvider {
  return {
    name: 'offline',

    async tutor(req: TutorRequest, onToken): Promise<TutorResult> {
      const lastUser = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const { corrections, followUp } = analyse(lastUser);

      const text =
        corrections.length > 0
          ? `Almost correct! ${corrections[0]!.explanation}`
          : `${pick(PRAISE, lastUser)} ${pick(FOLLOW_UPS, lastUser)}`;

      // Emit in small pieces so the client's streaming path is genuinely exercised.
      for (const word of text.split(/(?<=\s)/)) {
        onToken(word);
        await new Promise((r) => setTimeout(r, 12));
      }

      const reply: TutorReply = {
        reply: text,
        corrections,
        newVocab: [],
        followUp: followUp ?? (corrections.length === 0 ? null : null),
        signals: { userStruggling: corrections.length >= 2, suggestLevelUp: false },
      };

      return {
        reply,
        // Rough parity with a real call so budget accounting behaves the same.
        usage: {
          inputTokens: Math.ceil(req.systemPrompt.length / 4),
          outputTokens: Math.ceil(text.length / 4),
        },
      };
    },

    async summarise(text: string): Promise<string> {
      const flat = text.replace(/\s+/g, ' ').trim();
      return flat.length <= 240 ? flat : `${flat.slice(0, 237)}...`;
    },
  };
}
