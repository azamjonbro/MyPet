import type { MeResponse, PetEvent, PetState } from '@pet/shared';

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
  | { type: 'HOST_MUTE'; host: string };

export type SessionState =
  | { status: 'signed-out' }
  | { status: 'loading' }
  | { status: 'signed-in'; me: MeResponse }
  | { status: 'error'; code: string; message: string };

export type Response =
  | { ok: true; session: SessionState }
  | { ok: true; position: { x: number; y: number } | null }
  | { ok: true }
  | { ok: false; code: string; message: string };

/** Pushed from the worker to any open pet — never a reply to a request. */
export type Push =
  | { type: 'PET_STATE'; state: PetState }
  | { type: 'SESSION_CHANGED'; session: SessionState };

export async function send<R extends Response = Response>(req: Request): Promise<R> {
  return (await chrome.runtime.sendMessage(req)) as R;
}
