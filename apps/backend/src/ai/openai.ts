import OpenAI from 'openai';
import { tutorReplySchema } from '@pet/shared';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { createReplyExtractor } from './replyStream.js';
import { TUTOR_REPLY_JSON_SCHEMA } from './schemas/tutorReply.js';
import type { LLMProvider, TutorRequest, TutorResult } from './provider.js';

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
