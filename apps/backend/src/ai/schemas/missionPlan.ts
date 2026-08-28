import { SKILLS, TASK_KINDS } from '@pet/shared';

/**
 * Strict structured output for the mission planner.
 *
 * Hand-written for the same reason as TUTOR_REPLY_JSON_SCHEMA: OpenAI's strict
 * mode wants `additionalProperties: false` and every property in `required`,
 * which a generic zod converter does not reliably produce. `missionPlanSchema`
 * in @pet/shared still validates the result, and a test keeps the two aligned.
 */
export const MISSION_PLAN_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'focus', 'tasks'],
  properties: {
    title: { type: 'string', description: 'The day in three or four words, e.g. "Talking about food".' },
    focus: { type: 'string', description: 'One sentence saying what today builds.' },
    tasks: {
      type: 'array',
      description: 'Three or four tasks. At least one must be `chat`.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'skill', 'title', 'detail'],
        properties: {
          kind: { type: 'string', enum: [...TASK_KINDS] },
          skill: { type: 'string', enum: [...SKILLS] },
          title: { type: 'string', description: 'What to do, in a few words.' },
          detail: { type: 'string', description: 'The actual instruction or prompt, at the learner\'s level.' },
        },
      },
    },
  },
} as const;
