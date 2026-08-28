import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { DailyUsage } from '../models/DailyUsage.js';

/**
 * A per-user daily token ceiling, checked BEFORE the call rather than after.
 *
 * Without it, one enthusiastic learner or one retry loop is an unbounded bill —
 * the single largest cost risk in the product (§O).
 */
export async function assertWithinBudget(userId: string, localDate: string): Promise<void> {
  const usage = await DailyUsage.findOne({ userId, localDate }).lean();
  const used = (usage?.inputTokens ?? 0) + (usage?.outputTokens ?? 0);
  if (used >= env.DAILY_TOKEN_BUDGET) {
    throw new AppError(
      429,
      'AI_BUDGET_EXCEEDED',
      "That's a lot of practice for one day! Mocha needs to rest — come back tomorrow.",
    );
  }
}

export async function recordUsage(
  userId: string,
  localDate: string,
  usage: { inputTokens: number; outputTokens: number },
): Promise<void> {
  await DailyUsage.updateOne(
    { userId, localDate },
    {
      $inc: {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        calls: 1,
      },
    },
    { upsert: true },
  );
}
