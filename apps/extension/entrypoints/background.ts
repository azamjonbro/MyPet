import type { MeResponse } from '@pet/shared';
import { api, ApiError, signOut, streamChat } from '../src/services/api.js';
import { localStore, sessionStore } from '../src/services/storage.js';
import { CHAT_PORT } from '../src/types/messages.js';
import type {
  ChatPortEvent,
  ChatPortRequest,
  Push,
  Request,
  Response,
  SessionState,
} from '../src/types/messages.js';

/**
 * The service worker is the only surface that touches the network.
 *
 * MV3 terminates an idle worker after ~30s, so there is deliberately NO
 * module-scope state here: everything is read from chrome.storage on demand.
 * A variable declared up here would silently be empty on the next wake.
 */

async function currentSession(): Promise<SessionState> {
  const refreshToken = await localStore.getRefreshToken();
  if (!refreshToken) return { status: 'signed-out' };

  const cached = await localStore.getCachedMe<MeResponse>();
  try {
    const me = await api.me();
    await localStore.setCachedMe(me);
    return { status: 'signed-in', me };
  } catch (err) {
    // Offline or backend down: a cached profile still lets the pet work.
    if (cached) return { status: 'signed-in', me: cached };
    if (err instanceof ApiError) {
      if (err.code === 'UNAUTHENTICATED') return { status: 'signed-out' };
      return { status: 'error', code: err.code, message: err.message };
    }
    return { status: 'error', code: 'INTERNAL', message: 'Something went wrong.' };
  }
}

async function broadcast(push: Push): Promise<void> {
  const tabs = await chrome.tabs.query({});
  await Promise.all(
    tabs.map((tab) =>
      tab.id ? chrome.tabs.sendMessage(tab.id, push).catch(() => {}) : Promise.resolve(),
    ),
  );
}

async function handle(req: Request): Promise<Response> {
  switch (req.type) {
    case 'SESSION_GET':
      return { ok: true, session: await currentSession() };

    case 'SESSION_SIGN_IN_DEV': {
      await api.signInDev(req.email);
      const session = await currentSession();
      await broadcast({ type: 'SESSION_CHANGED', session });
      return { ok: true, session };
    }

    case 'SESSION_SIGN_OUT': {
      await signOut();
      const session: SessionState = { status: 'signed-out' };
      await broadcast({ type: 'SESSION_CHANGED', session });
      return { ok: true, session };
    }

    case 'ME_REFRESH': {
      await sessionStore.clear();
      return { ok: true, session: await currentSession() };
    }

    case 'PET_POSITION_GET':
      return { ok: true, position: await localStore.getPosition(req.host) };

    case 'PET_POSITION_SET':
      await localStore.setPosition(req.host, req.x, req.y);
      return { ok: true };

    case 'HOST_MUTE': {
      const me = await localStore.getCachedMe<MeResponse>();
      if (me && !me.user.settings.blockedHosts.includes(req.host)) {
        me.user.settings.blockedHosts.push(req.host);
        await localStore.setCachedMe(me);
      }
      return { ok: true };
    }

    case 'PROGRESS_GET': {
      const [summary, weaknesses, history] = await Promise.all([
        api.progressSummary(),
        api.weaknesses(),
        api.history(14),
      ]);
      return { ok: true, progress: { summary, weaknesses, history } };
    }

    case 'PET_EVENT':
      // Phase 3+ will turn learner-side events into tutor calls. For now the
      // pet drives its own state machine locally.
      return { ok: true };

    default:
      return { ok: false, code: 'NOT_FOUND', message: 'Unknown message.' };
  }
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    handle(message as Request)
      .then(sendResponse)
      .catch((err: unknown) => {
        const e = err instanceof ApiError ? err : null;
        sendResponse({
          ok: false,
          code: e?.code ?? 'INTERNAL',
          message: e?.message ?? 'Something went wrong.',
        } satisfies Response);
      });
    return true; // keep the message channel open for the async reply
  });

  chrome.action.onClicked.addListener(() => {
    chrome.runtime.openOptionsPage?.();
  });

  // --- chat streaming -----------------------------------------------------
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== CHAT_PORT) return;

    let controller: AbortController | null = null;
    let closed = false;

    const post = (event: ChatPortEvent) => {
      if (closed) return;
      try {
        port.postMessage(event);
      } catch {
        // The page went away mid-reply; stop rather than throwing.
        closed = true;
        controller?.abort();
      }
    };

    port.onDisconnect.addListener(() => {
      closed = true;
      controller?.abort();
    });

    port.onMessage.addListener((raw) => {
      const message = raw as ChatPortRequest;

      if (message.type === 'abort') {
        controller?.abort();
        return;
      }
      if (message.type !== 'send') return;

      controller?.abort();
      controller = new AbortController();

      void streamChat(
        { text: message.text, ...(message.sessionId ? { sessionId: message.sessionId } : {}) },
        post,
        controller.signal,
      ).catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        const e = err instanceof ApiError ? err : null;
        post({
          type: 'error',
          code: e?.code ?? 'INTERNAL',
          message: e?.message ?? 'Mochi could not answer. Try again.',
        });
      });
    });
  });
});
