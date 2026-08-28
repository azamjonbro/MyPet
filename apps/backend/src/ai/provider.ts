import type { CefrLevel, GrammarTopic, MissionPlan, TutorReply } from '@pet/shared';

export interface ProviderMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface TutorRequest {
  systemPrompt: string;
  messages: ProviderMessage[];
  /** CEFR level, so a provider can adapt sampling if it wants to. */
  level: string;
  /**
   * The learner's own calendar date, "YYYY-MM-DD".
   *
   * Passed explicitly because "remind me at seven" is dated against the
   * learner's day, and a provider reaching for the server's UTC date would put
   * the reminder in yesterday for anybody east of London.
   */
  todayLocal: string;
}

export interface TutorResult {
  reply: TutorReply;
  usage: { inputTokens: number; outputTokens: number };
}

export interface MissionPlanRequest {
  systemPrompt: string;
  level: CefrLevel;
  planDay: number;
  dailyGoalMinutes: number;
  weakTopics: GrammarTopic[];
}

export interface MissionPlanResult {
  plan: MissionPlan;
  usage: { inputTokens: number; outputTokens: number };
}

/**
 * One interface, so a model or vendor change is a contained change (§C).
 * Today there are two implementations: OpenAI, and a deterministic offline one.
 */
export interface LLMProvider {
  readonly name: string;
  /**
   * Streams the visible reply text through `onToken` as it arrives, and
   * resolves with the fully-parsed structured result.
   */
  tutor(req: TutorRequest, onToken: (text: string) => void): Promise<TutorResult>;
  /** A day's plan. The server assigns ids, targets and XP afterwards. */
  planMission(req: MissionPlanRequest): Promise<MissionPlanResult>;
  summarise(text: string, instruction: string): Promise<string>;
}
