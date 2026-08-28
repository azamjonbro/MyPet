import type {
  ChatStreamEvent,
  CompleteTaskResponse,
  HistoryDay,
  MeResponse,
  MissionResponse,
  NotionStatus,
  NotionSyncResult,
  NotionTarget,
  OnboardingRequest,
  PetEvent,
  PetState,
  ProgressSummary,
  UpdateSettingsRequest,
  Weakness,
} from '@pet/shared';

/**
 * The only contract between the content script / popup and the service worker.
 *
 * Nothing on the page ever calls the network directly: the worker owns the
 * tokens and is the single place a request can originate from (§H).
 */
export type Request =
  | { type: 'SESSION_GET' }
  | { type: 'SESSION_SIGN_IN_DEV'; email: string }
  | { type: 'SESSION_SIGN_OUT' }
  | { type: 'ME_REFRESH' }
  | { type: 'PET_EVENT'; event: PetEvent }
  | { type: 'PET_POSITION_SET'; host: string; x: number; y: number }
  | { type: 'PET_POSITION_GET'; host: string }
  | { type: 'HOST_MUTE'; host: string }
  | { type: 'PROGRESS_GET' }
  | { type: 'ONBOARDING_SUBMIT'; input: OnboardingRequest }
  | { type: 'SETTINGS_UPDATE'; patch: UpdateSettingsRequest }
  | { type: 'MISSION_GET' }
  | { type: 'MISSION_TASK_COMPLETE'; taskId: string }
  | { type: 'NOTION_STATUS' }
  | { type: 'NOTION_CONNECT' }
  | { type: 'NOTION_SYNC'; targets?: NotionTarget[] }
  | { type: 'NOTION_DISCONNECT' }
  | { type: 'FOLLOW_EVERYWHERE_GET' }
  | { type: 'FOLLOW_EVERYWHERE_SET'; enabled: boolean };

export interface ProgressBundle {
  summary: ProgressSummary;
  weaknesses: Weakness[];
  history: HistoryDay[];
}

export type SessionState =
  | { status: 'signed-out' }
  | { status: 'loading' }
  | { status: 'signed-in'; me: MeResponse }
  | { status: 'error'; code: string; message: string };

export type Response =
  | { ok: true; session: SessionState }
  | { ok: true; progress: ProgressBundle }
  | { ok: true; position: { x: number; y: number } | null }
  | { ok: true; mission: MissionResponse }
  | { ok: true; task: CompleteTaskResponse }
  | { ok: true; notion: NotionStatus }
  | { ok: true; sync: NotionSyncResult }
  | { ok: true; enabled: boolean }
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Pushed from the worker to any open pet — never a reply to a request. */
export type Push =
  | { type: 'PET_STATE'; state: PetState }
  | { type: 'SESSION_CHANGED'; session: SessionState }
  /**
   * Something changed today's mission. `remaining` is null when the sender
   * does not know the new count — the panels re-read rather than guess.
   */
  | { type: 'MISSION_CHANGED'; remaining: number | null };

/**
 * Chat runs over a long-lived port rather than one-shot messages, because a
 * reply arrives as many small chunks and the connection is what keeps the MV3
 * service worker alive while it streams.
 */
export const CHAT_PORT = 'chat';

export type ChatPortRequest =
  | { type: 'send'; text: string; sessionId?: string }
  | { type: 'abort' };

export type ChatPortEvent = ChatStreamEvent;

export async function send<R extends Response = Response>(req: Request): Promise<R> {
  return (await chrome.runtime.sendMessage(req)) as R;
}
