import type {
  AuthTokens,
  ChatStreamEvent,
  CompleteTaskResponse,
  HistoryDay,
  MeResponse,
  MissionResponse,
  NotionStatus,
  NotionSyncResult,
  NotionTarget,
  OnboardingRequest,
  ProgressSummary,
  UpdateSettingsRequest,
  Weakness,
} from '@pet/shared';
import { localStore, sessionStore } from './storage.js';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:4100/api/v1';

export class ApiError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return null;
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError('INTERNAL', 'The server sent something unreadable.', res.status);
  }
}

async function raw(path: string, init: RequestInit = {}, token?: string | null): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    // Distinguish "backend is not running" from "backend said no" — the two
    // need different empty states in the UI.
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Cannot reach the server. Is the backend running?', 0);
  }

  const body = await parse(res);
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ApiError(err?.code ?? 'INTERNAL', err?.message ?? 'Something went wrong.', res.status);
  }
  return body;
}

/** Exchanges the stored refresh token for a fresh pair. Returns null if we must sign in again. */
async function refreshSession(): Promise<string | null> {
  const refreshToken = await localStore.getRefreshToken();
  if (!refreshToken) return null;
  try {
    const tokens = (await raw('/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    })) as AuthTokens;
    await sessionStore.setAccessToken(tokens.accessToken, tokens.expiresIn);
    await localStore.setRefreshToken(tokens.refreshToken);
    return tokens.accessToken;
  } catch {
    await signOut();
    return null;
  }
}

/** Authenticated request with a single transparent retry after a refresh. */
async function authed(path: string, init: RequestInit = {}): Promise<unknown> {
  let token = await sessionStore.getAccessToken();
  if (!token) token = await refreshSession();
  if (!token) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.', 401);

  try {
    return await raw(path, init, token);
  } catch (err) {
    if (err instanceof ApiError && (err.code === 'TOKEN_EXPIRED' || err.status === 401)) {
      const fresh = await refreshSession();
      if (!fresh) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.', 401);
      return raw(path, init, fresh);
    }
    throw err;
  }
}

export const api = {
  async signInDev(email: string): Promise<void> {
    const tokens = (await raw('/auth/dev', {
      method: 'POST',
      body: JSON.stringify({
        email,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    })) as AuthTokens;
    await sessionStore.setAccessToken(tokens.accessToken, tokens.expiresIn);
    await localStore.setRefreshToken(tokens.refreshToken);
  },

  me(): Promise<MeResponse> {
    return authed('/me') as Promise<MeResponse>;
  },

  updateProfile(patch: Record<string, unknown>): Promise<MeResponse> {
    return authed('/me/profile', { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<MeResponse>;
  },

  progressSummary(): Promise<ProgressSummary> {
    return authed('/progress/summary') as Promise<ProgressSummary>;
  },

  async weaknesses(): Promise<Weakness[]> {
    const res = (await authed('/progress/weaknesses')) as { weaknesses: Weakness[] };
    return res.weaknesses;
  },

  async history(days = 14): Promise<HistoryDay[]> {
    const res = (await authed(`/progress/history?days=${days}`)) as { days: HistoryDay[] };
    return res.days;
  },

  onboarding(input: OnboardingRequest): Promise<MeResponse> {
    return authed('/me/onboarding', { method: 'POST', body: JSON.stringify(input) }) as Promise<MeResponse>;
  },

  updateSettings(patch: UpdateSettingsRequest): Promise<MeResponse> {
    return authed('/me/settings', { method: 'PATCH', body: JSON.stringify(patch) }) as Promise<MeResponse>;
  },

  missionToday(): Promise<MissionResponse> {
    return authed('/missions/today') as Promise<MissionResponse>;
  },

  completeTask(taskId: string): Promise<CompleteTaskResponse> {
    return authed(`/missions/today/tasks/${encodeURIComponent(taskId)}/complete`, {
      method: 'POST',
    }) as Promise<CompleteTaskResponse>;
  },

  notionStatus(): Promise<NotionStatus> {
    return authed('/notion/status') as Promise<NotionStatus>;
  },

  async notionAuthorizeUrl(): Promise<string> {
    const res = (await authed('/notion/connect')) as { authorizeUrl: string };
    return res.authorizeUrl;
  },

  notionSync(targets?: NotionTarget[]): Promise<NotionSyncResult> {
    return authed('/notion/sync', {
      method: 'POST',
      body: JSON.stringify(targets ? { targets } : {}),
    }) as Promise<NotionSyncResult>;
  },

  async notionDisconnect(): Promise<void> {
    await authed('/notion/disconnect', { method: 'POST' });
  },
};

/**
 * Streams a tutoring turn.
 *
 * Only the service worker calls this. Holding the SSE connection there is also
 * what keeps the MV3 worker alive for the length of the reply — an idle worker
 * is terminated after about thirty seconds, but one with an open stream is not.
 */
export async function streamChat(
  body: { text: string; sessionId?: string },
  onEvent: (event: ChatStreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let token = await sessionStore.getAccessToken();
  if (!token) token = await refreshSession();
  if (!token) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.', 401);

  const open = async (bearer: string) =>
    fetch(`${BASE}/chat/message`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${bearer}` },
      body: JSON.stringify(body),
      signal,
    });

  let res: Response;
  try {
    res = await open(token);
    if (res.status === 401) {
      const fresh = await refreshSession();
      if (!fresh) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.', 401);
      res = await open(fresh);
    }
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('UPSTREAM_UNAVAILABLE', 'Cannot reach the server. Is the backend running?', 0);
  }

  if (!res.ok || !res.body) {
    const parsed = (await parse(res).catch(() => null)) as
      | { error?: { code?: string; message?: string } }
      | null;
    throw new ApiError(
      parsed?.error?.code ?? 'INTERNAL',
      parsed?.error?.message ?? 'Mochi could not answer.',
      res.status,
    );
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += value;

    // SSE frames are separated by a blank line; a frame may arrive in pieces.
    let split = buffer.indexOf('\n\n');
    while (split !== -1) {
      const frame = buffer.slice(0, split).trim();
      buffer = buffer.slice(split + 2);
      if (frame.startsWith('data:')) {
        try {
          onEvent(JSON.parse(frame.slice(5).trim()) as ChatStreamEvent);
        } catch {
          // A malformed frame is not worth killing the whole reply for.
        }
      }
      split = buffer.indexOf('\n\n');
    }
  }
}

export async function signOut(): Promise<void> {
  const refreshToken = await localStore.getRefreshToken();
  if (refreshToken) {
    await raw('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => {});
  }
  await sessionStore.clear();
  await localStore.clear();
}
