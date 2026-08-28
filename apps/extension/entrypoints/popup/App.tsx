import { useCallback, useEffect, useState } from 'react';
import { isServerVerified, levelFromXp, type MissionResponse, type MissionTask } from '@pet/shared';
import { Onboarding } from './Onboarding.js';
import { Settings } from './Settings.js';
import { send, type SessionState } from '../../src/types/messages.js';

type View = 'home' | 'settings';

const KIND_ICON: Record<MissionTask['kind'], string> = {
  chat: '💬',
  vocab: '📖',
  fix: '🎯',
  write: '✍️',
  read: '📰',
  speak: '🗣️',
};

export function App() {
  const [session, setSession] = useState<SessionState>({ status: 'loading' });
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const [view, setView] = useState<View>('home');
  const [mission, setMission] = useState<MissionResponse | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);

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

  const loadMission = useCallback(async () => {
    setMissionError(null);
    const res = await send({ type: 'MISSION_GET' }).catch(() => null);
    if (res && 'mission' in res) setMission(res.mission);
    else if (res && !res.ok) setMissionError(res.message);
    else setMissionError('Could not load today.');
  }, []);

  // Only once the learner is set up: asking for a mission before onboarding
  // would plan a day against defaults they never chose.
  const onboarded = session.status === 'signed-in' && session.me.profile.onboarded;
  useEffect(() => {
    if (onboarded) void loadMission();
  }, [onboarded, loadMission]);

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
    setMission(null);
  }

  async function completeTask(taskId: string) {
    const res = await send({ type: 'MISSION_TASK_COMPLETE', taskId }).catch(() => null);
    if (res && 'task' in res) {
      setMission((prev) => (prev ? { ...prev, mission: res.task.mission } : prev));
      // XP moved, so the header numbers are stale.
      const refreshed = await send({ type: 'ME_REFRESH' }).catch(() => null);
      if (refreshed && 'session' in refreshed) setSession(refreshed.session);
    } else if (res && !res.ok) {
      setMissionError(res.message);
    }
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

  const { user, profile } = session.me;

  // --- onboarding ------------------------------------------------------
  if (!profile.onboarded) {
    return <Onboarding onDone={setSession} />;
  }

  if (view === 'settings') {
    return <Settings me={session.me} onSession={setSession} onBack={() => setView('home')} />;
  }

  // --- signed in -------------------------------------------------------
  const level = levelFromXp(profile.xp);
  const pct = Math.round(level.progress * 100);
  const tasks = mission?.mission.tasks ?? [];
  const done = tasks.filter((task) => task.done).length;

  return (
    <div className="wrap">
      <div className="head">
        <div className="av">🐕</div>
        <div style={{ flex: 1 }}>
          <b>{user.displayName}</b>
          <span>{profile.level} → {profile.targetLevel}</span>
        </div>
        <button className="link" onClick={() => setView('settings')} aria-label="Settings">
          Settings
        </button>
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

      {/* Today's mission: the one thing this popup is for. */}
      <div className="card">
        <h2>{mission ? mission.mission.title : 'Today'}</h2>

        {missionError ? (
          <>
            <p className="error">{missionError}</p>
            <button className="link" onClick={() => void loadMission()}>Try again</button>
          </>
        ) : !mission ? (
          <>
            <div className="skeleton" style={{ height: 16, marginBottom: 8 }} />
            <div className="skeleton" style={{ height: 44 }} />
          </>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 8 }}>
              <span className="sub">{mission.mission.focus}</span>
            </div>
            <ul className="tasks">
              {tasks.map((task) => {
                const manual = !isServerVerified(task.kind);
                return (
                  <li key={task.id} className={task.done ? 'done' : ''}>
                    <span className="ic" aria-hidden="true">{KIND_ICON[task.kind]}</span>
                    <span className="t">
                      <b>{task.title}</b>
                      <small>{task.detail}</small>
                    </span>
                    {task.done ? (
                      <span className="tick" aria-label="done">✓</span>
                    ) : manual ? (
                      <button
                        className="mark"
                        onClick={() => void completeTask(task.id)}
                        aria-label={`Mark "${task.title}" done`}
                      >
                        Done
                      </button>
                    ) : (
                      <span className="count" aria-label={`${task.progress} of ${task.target}`}>
                        {task.progress}/{task.target}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="row" style={{ marginTop: 8 }}>
              <span className="sub">
                {mission.mission.status === 'complete'
                  ? 'Finished — see you tomorrow 🎉'
                  : `${done} of ${tasks.length} done`}
              </span>
              <span className="sub">+{mission.completionBonus} XP bonus</span>
            </div>
          </>
        )}
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
    </div>
  );
}
