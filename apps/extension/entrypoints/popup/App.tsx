import { useEffect, useState } from 'react';
import { levelFromXp } from '@pet/shared';
import { send, type SessionState } from '../../src/types/messages.js';

export function App() {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await send({ type: 'SESSION_GET' }).catch(() => null);
      setSession(
        res && 'session' in res
          ? res.session
          : { status: 'error', code: 'INTERNAL', message: 'Could not reach the extension worker.' },
      );
    })();
  }, []);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSignInError(null);
    const res = await send({ type: 'SESSION_SIGN_IN_DEV', email }).catch(() => null);
    setBusy(false);
    if (res && 'session' in res) setSession(res.session);
    else if (res && !res.ok) setSignInError(res.message);
    else setSignInError('Could not reach the extension worker.');
  }

  async function signOut() {
    const res = await send({ type: 'SESSION_SIGN_OUT' }).catch(() => null);
    if (res && 'session' in res) setSession(res.session);
  }

  // --- loading ---------------------------------------------------------
  if (session.status === 'loading') {
    return (
      <div className="wrap">
        <div className="skeleton" style={{ height: 34 }} />
        <div className="skeleton" style={{ height: 86 }} />
        <div className="skeleton" style={{ height: 60 }} />
      </div>
    );
  }

  // --- error -----------------------------------------------------------
  if (session.status === 'error') {
    return (
      <div className="wrap">
        <div className="state">
          <span className="emoji">🔌</span>
          <p>{session.message}</p>
          <small>
            {session.code === 'UPSTREAM_UNAVAILABLE'
              ? 'Start it with: pnpm dev:backend'
              : `Code: ${session.code}`}
          </small>
        </div>
        <button className="primary" onClick={() => location.reload()}>Try again</button>
      </div>
    );
  }

  // --- signed out ------------------------------------------------------
  if (session.status === 'signed-out') {
    return (
      <div className="wrap">
        <div className="head">
          <div className="av">🐕</div>
          <div>
            <b>AI English Pet</b>
            <span>Sign in to meet Mochi</span>
          </div>
        </div>
        <form onSubmit={signIn} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-label="Email"
          />
          {signInError ? <p className="error">{signInError}</p> : null}
          <button className="primary" disabled={busy || !email}>
            {busy ? 'Signing in…' : 'Start learning'}
          </button>
        </form>
        <small style={{ color: 'var(--ink-3)', fontSize: 11.5 }}>
          Development sign-in. Google sign-in replaces this once a Google project exists.
        </small>
      </div>
    );
  }

  // --- signed in -------------------------------------------------------
  const { user, profile } = session.me;
  const level = levelFromXp(profile.xp);
  const pct = Math.round(level.progress * 100);

  return (
    <div className="wrap">
      <div className="head">
        <div className="av">🐕</div>
        <div style={{ flex: 1 }}>
          <b>{user.displayName}</b>
          <span>{profile.level} → {profile.targetLevel}</span>
        </div>
        <button className="link" onClick={signOut}>Sign out</button>
      </div>

      <div className="card">
        <h2>{profile.currentDay > 0 ? `Day ${profile.currentDay} of 90` : 'Not started yet'}</h2>
        <div className="row">
          <span className="big">{level.title}</span>
          <span className="sub">Level {level.level}</span>
        </div>
        <div className="bar">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="row" style={{ marginTop: 6 }}>
          <span className="sub">{profile.xp} XP</span>
          <span className="sub">
            {level.xpForNextLevel > 0 ? `${level.xpForNextLevel - level.xpIntoLevel} to next` : 'Max level'}
          </span>
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <b>🔥 {profile.streak.current}</b>
          <span>day streak</span>
        </div>
        <div className="stat">
          <b>{profile.dailyGoalMinutes}m</b>
          <span>daily goal</span>
        </div>
      </div>

      <button
        className="primary"
        onClick={() => {
          // sidePanel.open must be called from a user gesture, which this is.
          chrome.windows.getCurrent().then((w) => {
            if (w.id !== undefined) void chrome.sidePanel.open({ windowId: w.id });
          });
        }}
      >
        Open dashboard
      </button>

      {profile.currentDay === 0 ? (
        <div className="state" style={{ padding: '10px 0 0' }}>
          <p style={{ fontSize: 13 }}>Your 90-day plan hasn't started.</p>
          <small>Onboarding arrives in Phase 6.</small>
        </div>
      ) : null}
    </div>
  );
}
