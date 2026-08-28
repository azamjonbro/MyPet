import { LEVEL_VOICE, TOPIC_LABEL, type CefrLevel, type GrammarTopic } from '@pet/shared';

export interface MissionPromptContext {
  level: CefrLevel;
  targetLevel: CefrLevel;
  targetExam: string;
  planDay: number;
  dailyGoalMinutes: number;
  weakTopics: GrammarTopic[];
  recentTitles: string[];
  displayName: string;
}

/**
 * The mission planner's prompt.
 *
 * It asks for the *shape* of a day's practice and nothing else: no XP, no
 * targets, no ids. Those are assigned by the server after the plan is
 * validated, so the worst a confused — or injected — model can do is suggest a
 * dull task, never mint a reward.
 */
export function buildMissionPrompt(ctx: MissionPromptContext): string {
  const voice = LEVEL_VOICE[ctx.level];

  const lines: string[] = [
    'You plan one day of English practice for a learner using a browser companion called Mochi.',
    'A day is small: three or four tasks that together fit the learner\'s daily goal. Never more.',
    '',
    '## The learner',
    `Name: ${ctx.displayName}`,
    `Level ${ctx.level}, working towards ${ctx.targetLevel}${ctx.targetExam !== 'NONE' ? ` (${ctx.targetExam})` : ''}.`,
    ctx.planDay > 0 ? `Day ${ctx.planDay} of 90.` : 'Day 1 — they have just started.',
    `Daily goal: about ${ctx.dailyGoalMinutes} minutes.`,
    `Write every task title and detail in English simple enough for ${ctx.level}: sentences under ${voice.maxSentenceWords} words.`,
    '',
    '## Task kinds, and what each one means',
    '- chat: talk to Mochi about something specific. Say what to talk about.',
    '- vocab: learn new words while chatting.',
    '- fix: practise one grammar point the learner keeps getting wrong.',
    '- write: write a short text. Give the exact prompt.',
    '- read: read something in English for a few minutes. Suggest what.',
    '- speak: say something out loud. Give the exact sentence or question.',
    '',
    'Include at least one `chat` task — that is where the tutoring happens.',
    'Vary the kinds across the day. Do not give two tasks of the same kind.',
    '',
    '## Output',
    'Return only the JSON object described by the schema. No markdown, no code fences.',
  ];

  if (ctx.weakTopics.length > 0) {
    lines.push(
      '',
      '## What this learner keeps getting wrong',
      ...ctx.weakTopics.map((t) => `- ${TOPIC_LABEL[t]}`),
      'Aim the `fix` task at the first of these.',
    );
  }

  if (ctx.recentTitles.length > 0) {
    lines.push(
      '',
      '## Recent missions — do not repeat these',
      ...ctx.recentTitles.map((t) => `- ${t}`),
    );
  }

  return lines.join('\n');
}
