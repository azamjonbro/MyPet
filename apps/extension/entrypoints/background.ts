import type { MeResponse, PetState } from '@pet/shared';
import { api, ApiError, signOut, streamChat } from '../src/services/api.js';
import { localStore, sessionStore } from '../src/services/storage.js';
import {
  HOURLY_ALARM,
  MISSION_NOTIFICATION,
  STREAK_NOTIFICATION,
  ensureAlarms,
  openDashboard,
  runChecks,
} from '../src/services/notifications.js';
import { hasFollowEverywhere, revokeFollowEverywhere, syncRegistration } from '../src/services/hostAccess.js';
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

async function pushPetState(state: PetState): Promise<void> {
  await broadcast({ type: 'PET_STATE', state });
}

/**
 * The hourly beat: reminders, and a nudge to any pet currently on screen.
 *
 * Everything it needs is re-read from storage, because an MV3 worker that has
 * been asleep since the last alarm has no module state left to trust.
 */
async function hourlyBeat(): Promise<void> {
  const outcome = await runChecks();

  if (outcome.missionRemaining !== null && outcome.missionRemaining > 0) {
    await broadcast({ type: 'MISSION_CHANGED', remaining: outcome.missionRemaining });
    await pushPetState('notifying');
  } else if (outcome.streakAtRisk) {
    await pushPetState('sad');
  }
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

    case 'ONBOARDING_SUBMIT': {
      const me = await api.onboarding(req.input);
      await localStore.setCachedMe(me);
      const session: SessionState = { status: 'signed-in', me };
      await broadcast({ type: 'SESSION_CHANGED', session });
      return { ok: true, session };
    }

    case 'SETTINGS_UPDATE': {
      const me = await api.updateSettings(req.patch);
      await localStore.setCachedMe(me);
      const session: SessionState = { status: 'signed-in', me };
      await broadcast({ type: 'SESSION_CHANGED', session });
      return { ok: true, session };
    }

    case 'MISSION_GET':
      return { ok: true, mission: await api.missionToday() };

    case 'MISSION_TASK_COMPLETE': {
      const result = await api.completeTask(req.taskId);
      const remaining = result.mission.tasks.filter((task) => !task.done).length;
      await broadcast({ type: 'MISSION_CHANGED', remaining });
      if (result.xpAwarded > 0) {
        await pushPetState(result.missionCompleted ? 'celebrating' : 'happy');
      }
      return { ok: true, task: result };
    }

    case 'NOTION_STATUS':
      return { ok: true, notion: await api.notionStatus() };

    case 'NOTION_CONNECT': {
      // Notion redirects a normal browser tab back to our backend, which then
      // renders the "connected" page — so the flow has to leave the extension.
      const url = await api.notionAuthorizeUrl();
      await chrome.tabs.create({ url });
      return { ok: true };
    }

    case 'NOTION_SYNC':
      return { ok: true, sync: await api.notionSync(req.targets) };

    case 'NOTION_DISCONNECT':
      await api.notionDisconnect();
      return { ok: true };

    case 'FOLLOW_EVERYWHERE_GET':
      return { ok: true, enabled: await hasFollowEverywhere() };

    case 'FOLLOW_EVERYWHERE_SET': {
      // Granting needs a user gesture, so the popup does that part itself and
      // then tells us; here we only ever revoke, and keep registration in step.
      if (!req.enabled) await revokeFollowEverywhere();
      return { ok: true, enabled: await syncRegistration() };
    }

    case 'PET_EVENT':
      // The pet drives its own state machine locally; the worker only pushes
      // the reactions it alone knows about, like a mission falling due.
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

  // --- reminders, and the optional "follow me everywhere" script ----------
  chrome.runtime.onInstalled.addListener(() => {
    ensureAlarms();
    void syncRegistration();
  });
  chrome.runtime.onStartup.addListener(() => {
    ensureAlarms();
    void syncRegistration();
  });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name !== HOURLY_ALARM) return;
    void hourlyBeat().catch(() => {
      /* the next hour will try again */
    });
  });

  chrome.notifications.onClicked.addListener((id) => {
    if (id !== MISSION_NOTIFICATION && id !== STREAK_NOTIFICATION) return;
    chrome.notifications.clear(id);
    void openDashboard();
  });

  // A permission granted from the popup has to become a registered script here.
  chrome.permissions.onAdded.addListener(() => void syncRegistration());
  chrome.permissions.onRemoved.addListener(() => void syncRegistration());

  // --- chat streaming -----------------------------------------------------
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== CHAT_PORT) return;

    let controller: AbortController | null = null;
    let closed = false;

    const post = (event: ChatPortEvent) => {
      // A mission finished mid-conversation is news for the panels too, not
      // just for the pet that happens to be streaming it.
      if (event.type === 'mission') {
        void broadcast({ type: 'MISSION_CHANGED', remaining: null }).catch(() => {});
      }
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
