import { useEffect, useState } from 'react';
import type { StudySession } from '@pet/shared';
import { send } from '../../src/types/messages.js';

const LENGTHS = [15, 25, 30, 45] as const;

/**
 * A study session, started by hand.
 *
 * Explicit on purpose: the app never infers studying from the computer being
 * on or from which pages are open. Minutes count because somebody said "go" —
 * which is also what makes them worth counting.
 */
export function StudyCard({ onFinished }: { onFinished: () => void }) {
  const [session, setSession] = useState<StudySession | null>(null);
  const [planned, setPlanned] = useState<number>(30);
  const [elapsed, setElapsed] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await send({ type: 'STUDY_GET' }).catch(() => null);
      if (res && 'study' in res) setSession(res.study);
    })();
  }, []);

  // A local tick, not a stored countdown: the session's truth is its start
  // time on the server, so a closed panel loses nothing.
  useEffect(() => {
    if (!session) return;
    const update = () =>
      setElapsed(Math.floor((Date.now() - Date.parse(session.startedAt)) / 1000));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [session]);

  async function start() {
    setBusy(true);
    setNote(null);
    const res = await send({ type: 'STUDY_START', subject: 'English', plannedMinutes: planned }).catch(
      () => null,
    );
    setBusy(false);
    if (res && 'study' in res) setSession(res.study);
  }

  async function end() {
    setBusy(true);
    const res = await send({ type: 'STUDY_END' }).catch(() => null);
    setBusy(false);
    if (res && 'study' in res && res.study) {
      setNote(
        `${res.study.minutes} minutes logged${res.xpAwarded ? ` · +${res.xpAwarded} XP` : ''}.`,
      );
      setSession(null);
      onFinished();
    }
  }

  if (session) {
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    const pct = Math.min(100, (elapsed / (session.plannedMinutes * 60)) * 100);

    return (
      <div className="card">
        <h2>{session.subject} · in progress</h2>
        <div className="timer">
          {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
          <span>of {session.plannedMinutes} min</span>
        </div>
        <div className="track">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="notion-actions">
          <button className="primary" disabled={busy} onClick={() => void end()}>
            {busy ? 'Saving…' : 'Finish session'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>Study session</h2>
      {note ? <p className="ok-note" style={{ marginTop: 0 }}>{note}</p> : null}
      <div className="chips">
        {LENGTHS.map((length) => (
          <button
            key={length}
            className={`chip${length === planned ? ' on' : ''}`}
            onClick={() => setPlanned(length)}
          >
            {length}m
          </button>
        ))}
      </div>
      <div className="notion-actions">
        <button className="primary" disabled={busy} onClick={() => void start()}>
          {busy ? 'Starting…' : 'Start studying'}
        </button>
      </div>
      <p className="hint-note">
        The minutes count towards today's plan. Mocha only counts what you start.
      </p>
    </div>
  );
}
