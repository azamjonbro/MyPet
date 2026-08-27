import type { AuthTokens, MeResponse } from '@pet/shared';
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
};

export async function signOut(): Promise<void> {
  const refreshToken = await localStore.getRefreshToken();
  if (refreshToken) {
    await raw('/auth/logout', { method: 'POST', body: JSON.stringify({ refreshToken }) }).catch(() => {});
  }
  await sessionStore.clear();
  await localStore.clear();
}
