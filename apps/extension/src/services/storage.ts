/**
 * Storage is split on purpose (§I):
 *   session — memory-backed, cleared when the browser closes. Access token.
 *   local   — survives restarts. Refresh token, cached profile, pet position.
 */
const ACCESS = 'auth.accessToken';
const ACCESS_EXP = 'auth.accessExpiresAt';
const REFRESH = 'auth.refreshToken';
const ME = 'cache.me';
const POSITIONS = 'pet.positions';

export const sessionStore = {
  async getAccessToken(): Promise<string | null> {
    const v = await chrome.storage.session.get([ACCESS, ACCESS_EXP]);
    const token = v[ACCESS] as string | undefined;
    const expiresAt = v[ACCESS_EXP] as number | undefined;
    if (!token || !expiresAt || expiresAt <= Date.now()) return null;
    return token;
  },
  async setAccessToken(token: string, expiresInSeconds: number): Promise<void> {
    await chrome.storage.session.set({
      [ACCESS]: token,
      // Refresh a little early so a request never races the expiry.
      [ACCESS_EXP]: Date.now() + Math.max(0, expiresInSeconds - 30) * 1000,
    });
  },
  async clear(): Promise<void> {
    await chrome.storage.session.remove([ACCESS, ACCESS_EXP]);
  },
};

export const localStore = {
  async getRefreshToken(): Promise<string | null> {
    return ((await chrome.storage.local.get(REFRESH))[REFRESH] as string | undefined) ?? null;
  },
  async setRefreshToken(token: string): Promise<void> {
    await chrome.storage.local.set({ [REFRESH]: token });
  },
  async getCachedMe<T>(): Promise<T | null> {
    return ((await chrome.storage.local.get(ME))[ME] as T | undefined) ?? null;
  },
  async setCachedMe(me: unknown): Promise<void> {
    await chrome.storage.local.set({ [ME]: me });
  },
  async clear(): Promise<void> {
    await chrome.storage.local.remove([REFRESH, ME]);
  },

  async getPosition(host: string): Promise<{ x: number; y: number } | null> {
    const all = ((await chrome.storage.local.get(POSITIONS))[POSITIONS] ?? {}) as Record<
      string,
      { x: number; y: number }
    >;
    return all[host] ?? null;
  },
  async setPosition(host: string, x: number, y: number): Promise<void> {
    const all = ((await chrome.storage.local.get(POSITIONS))[POSITIONS] ?? {}) as Record<
      string,
      { x: number; y: number }
    >;
    all[host] = { x, y };
    await chrome.storage.local.set({ [POSITIONS]: all });
  },
};
