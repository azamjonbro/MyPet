import {
  TOPIC_LABEL,
  type Correction,
  type GrammarTopic,
  type MissionPlan,
  type TutorReply,
  type VocabItem,
} from '@pet/shared';
import type { LLMProvider, MissionPlanRequest, MissionPlanResult, TutorRequest, TutorResult } from './provider.js';

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

/**
 * A small word bank, so the offline tutor teaches vocabulary rather than only
 * correcting. Without it a mission's `vocab` task is unfinishable on a clone
 * with no API key — and "the whole thing runs on a fresh checkout" is a
 * property worth keeping true.
 */
const WORD_BANK: VocabItem[] = [
  { word: 'commute', definition: 'The journey between home and work.', example: 'My commute takes forty minutes.' },
  { word: 'errand', definition: 'A short trip to do one small job.', example: 'I have two errands this morning.' },
  { word: 'cosy', definition: 'Small, warm and comfortable.', example: 'Their kitchen is very cosy.' },
  { word: 'to postpone', definition: 'To move something to a later time.', example: 'We postponed the meeting.' },
  { word: 'reliable', definition: 'You can trust it to work every time.', example: 'She is a reliable friend.' },
  { word: 'to look forward to', definition: 'To feel happy about something in the future.', example: 'I look forward to Friday.' },
  { word: 'crowded', definition: 'Full of people.', example: 'The bus was crowded this morning.' },
  { word: 'to figure out', definition: 'To understand something after thinking.', example: 'I figured out the problem.' },
  { word: 'spare time', definition: 'Time when you are not working.', example: 'I read in my spare time.' },
  { word: 'straightforward', definition: 'Simple and easy to understand.', example: 'The instructions were straightforward.' },
  { word: 'to get used to', definition: 'To slowly find something normal.', example: 'I got used to the cold.' },
  { word: 'worth it', definition: 'Good enough for the time or money it costs.', example: 'The long walk was worth it.' },
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


/**
 * The template mission planner.
 *
 * Exported on its own because it is two things at once: what the offline
 * provider returns, and what the mission service falls back to when a
 * configured model fails. A learner opening the extension on a morning when
 * OpenAI is down should still get a day's work, not an error card.
 */
interface Theme {
  title: string;
  focus: string;
  chat: string;
  write: string;
  read: string;
  listen: string;
  speak: string;
}

const THEMES: Theme[] = [
  {
    title: 'Your day',
    focus: 'Talk about ordinary things in the past and the present.',
    chat: 'Tell Mochi three things you did today. Use full sentences.',
    write: 'Write four sentences about your morning.',
    read: 'Read one short news story in English for five minutes.',
    listen: 'Listen to a short podcast about daily life. Write down two words you hear.',
    speak: 'Say out loud: "Today I woke up at ... and then I ..."',
  },
  {
    title: 'Food and eating',
    focus: 'Words for food, and asking questions about it.',
    chat: 'Describe your favourite meal to Mochi. Say why you like it.',
    write: 'Write a short recipe in five steps.',
    read: 'Read a recipe in English and find three new words.',
    listen: 'Watch a two-minute cooking video in English. Listen for the verbs.',
    speak: 'Order a coffee out loud, the way you would in a cafe.',
  },
  {
    title: 'People you know',
    focus: 'Describing people, and using adjectives well.',
    chat: 'Describe a friend to Mochi: how they look, and what they are like.',
    write: 'Write five sentences about someone in your family.',
    read: 'Read a short profile or interview in English.',
    listen: 'Listen to someone describe their family. Note how they say ages.',
    speak: 'Introduce yourself out loud in four sentences.',
  },
  {
    title: 'Work and study',
    focus: 'Talking about what you do, and what you are working on.',
    chat: 'Tell Mochi what you are working on this week.',
    write: 'Write a short message asking a colleague for help.',
    read: 'Read one page of something about your field, in English.',
    listen: 'Watch a short talk about work. Listen for how they start sentences.',
    speak: 'Explain your job out loud in three sentences.',
  },
  {
    title: 'Plans and the future',
    focus: 'Future forms: going to, will, and the present continuous.',
    chat: 'Tell Mochi about your plans for the weekend.',
    write: 'Write four sentences about next year.',
    read: 'Read about an event you would like to go to.',
    listen: 'Listen to a weather forecast in English. Note the future forms.',
    speak: 'Say three plans out loud, starting with "I am going to ...".',
  },
  {
    title: 'Places',
    focus: 'Describing places, and prepositions of place.',
    chat: 'Describe your city to Mochi. What is good, what is not?',
    write: 'Write five sentences about a place you love.',
    read: 'Read a short travel article in English.',
    listen: 'Watch a two-minute travel video. Listen for place words: at, in, on.',
    speak: 'Give directions out loud from your home to the nearest shop.',
  },
  {
    title: 'Stories',
    focus: 'The past simple, and keeping a story in order.',
    chat: 'Tell Mochi a short story about something that happened to you.',
    write: 'Write a story in six sentences. Begin with "Last year ...".',
    read: 'Read a very short story in English.',
    listen: 'Listen to someone tell a story. Note every past tense verb you catch.',
    speak: 'Tell your story out loud, without reading it.',
  },
  {
    title: 'Opinions',
    focus: 'Saying what you think, and giving reasons.',
    chat: 'Tell Mochi what you think about social media, and why.',
    write: 'Write four sentences: two for, two against.',
    read: 'Read one opinion article in English.',
    listen: 'Watch a short interview. Listen for how they disagree politely.',
    speak: 'Say your opinion out loud in three sentences.',
  },
];

/** Deterministic: the same day always produces the same mission. */
export function templatePlan(req: MissionPlanRequest): MissionPlan {
  const theme = THEMES[Math.max(0, req.planDay - 1) % THEMES.length]!;
  const weak = req.weakTopics[0];

  const tasks: MissionPlan['tasks'] = [
    { kind: 'chat', skill: 'writing', title: 'Talk to Mochi', detail: theme.chat },
    { kind: 'vocab', skill: 'vocabulary', title: 'Collect new words', detail: 'Ask Mochi for new words while you chat, and use each one in a sentence.' },
  ];

  if (weak) {
    tasks.push({
      kind: 'fix',
      skill: 'grammar',
      title: `Get ${TOPIC_LABEL[weak]} right`,
      detail: `This is the mistake you make most. Write messages today without it. Ask Mochi if you are unsure.`,
    });
  } else {
    tasks.push({ kind: 'read', skill: 'reading', title: 'Read a little', detail: theme.read });
  }

  // The fourth task rotates, so a week of missions exercises writing, speaking
  // and listening rather than the same skill every day.
  const rotation = [
    { kind: 'write', skill: 'writing', title: 'Write it down', detail: theme.write },
    { kind: 'speak', skill: 'speaking', title: 'Say it out loud', detail: theme.speak },
    { kind: 'listen', skill: 'listening', title: 'Listen for a minute', detail: theme.listen },
  ] as const;
  tasks.push({ ...rotation[Math.max(0, req.planDay) % rotation.length]! });

  return { title: theme.title, focus: theme.focus, tasks };
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

      // One word per turn, chosen deterministically from the message so the
      // same input always teaches the same word.
      const newVocab = lastUser.trim().length >= 8 ? [pick(WORD_BANK, lastUser)] : [];

      const reply: TutorReply = {
        reply: text,
        corrections,
        newVocab,
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

    async planMission(req: MissionPlanRequest): Promise<MissionPlanResult> {
      return {
        plan: templatePlan(req),
        usage: { inputTokens: Math.ceil(req.systemPrompt.length / 4), outputTokens: 120 },
      };
    },

    async summarise(text: string): Promise<string> {
      const flat = text.replace(/\s+/g, ' ').trim();
      return flat.length <= 240 ? flat : `${flat.slice(0, 237)}...`;
    },
  };
}
