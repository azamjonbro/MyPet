import OpenAI from 'openai';
import { missionPlanSchema, tutorReplySchema } from '@pet/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { createReplyExtractor } from './replyStream.js';
import { TUTOR_REPLY_JSON_SCHEMA } from './schemas/tutorReply.js';
import { MISSION_PLAN_JSON_SCHEMA } from './schemas/missionPlan.js';
import type {
  LLMProvider,
  MissionPlanRequest,
  MissionPlanResult,
  TutorRequest,
  TutorResult,
} from './provider.js';

export function createOpenAIProvider(): LLMProvider {
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  return {
    name: 'openai',

    async tutor(req: TutorRequest, onToken): Promise<TutorResult> {
      const extractor = createReplyExtractor();
      let raw = '';

      let stream;
      try {
        stream = await client.chat.completions.create({
          model: env.OPENAI_MODEL_TUTOR,
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.7,
          max_completion_tokens: 700,
          messages: [{ role: 'system', content: req.systemPrompt }, ...req.messages],
          response_format: {
            type: 'json_schema',
            json_schema: { name: 'tutor_reply', strict: true, schema: TUTOR_REPLY_JSON_SCHEMA },
          },
        });
      } catch {
        throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Mochi cannot think right now. Try again in a moment.');
      }

      let inputTokens = 0;
      let outputTokens = 0;

      for await (const chunk of stream) {
        if (chunk.usage) {
          inputTokens = chunk.usage.prompt_tokens ?? 0;
          outputTokens = chunk.usage.completion_tokens ?? 0;
        }
        const delta = chunk.choices[0]?.delta?.content;
        if (!delta) continue;
        raw += delta;
        const visible = extractor.push(delta);
        if (visible) onToken(visible);
      }

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Mochi got confused. Try saying that again.');
      }

      const parsed = tutorReplySchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Mochi got confused. Try saying that again.');
      }

      return { reply: parsed.data, usage: { inputTokens, outputTokens } };
    },

    async planMission(req: MissionPlanRequest): Promise<MissionPlanResult> {
      // The cheap model is enough: planning a day is selection, not reasoning,
      // and the schema does most of the work of keeping it sane.
      const res = await client.chat.completions.create({
        model: env.OPENAI_MODEL_CHEAP,
        temperature: 0.8,
        max_completion_tokens: 600,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: 'Plan today.' },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'mission_plan', strict: true, schema: MISSION_PLAN_JSON_SCHEMA },
        },
      });

      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(res.choices[0]?.message?.content ?? '');
      } catch {
        throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Could not plan today. Using the standard plan.');
      }

      const parsed = missionPlanSchema.safeParse(parsedJson);
      if (!parsed.success) {
        throw new AppError(502, 'UPSTREAM_UNAVAILABLE', 'Could not plan today. Using the standard plan.');
      }

      return {
        plan: parsed.data,
        usage: {
          inputTokens: res.usage?.prompt_tokens ?? 0,
          outputTokens: res.usage?.completion_tokens ?? 0,
        },
      };
    },

    async summarise(text: string, instruction: string): Promise<string> {
      // Cheap model: compressing known turns needs no reasoning (§G).
      const res = await client.chat.completions.create({
        model: env.OPENAI_MODEL_CHEAP,
        temperature: 0.2,
        max_completion_tokens: 160,
        messages: [
          { role: 'system', content: instruction },
          { role: 'user', content: text },
        ],
      });
      return res.choices[0]?.message?.content?.trim() ?? '';
    },
  };
}
