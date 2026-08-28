import { useState } from 'react';
import { CEFR_LEVELS, TARGET_EXAMS, type CefrLevel, type TargetExam } from '@pet/shared';
import { EVERYWHERE_ORIGINS } from '../../src/services/hostAccess.js';
import { send, type SessionState } from '../../src/types/messages.js';

const GOALS = [10, 20, 30, 45] as const;

const LEVEL_HINT: Record<CefrLevel, string> = {
  A1: 'A few words and phrases',
  A2: 'Simple everyday sentences',
  B1: 'I can hold a conversation',
  B2: 'I can argue a point',
  C1: 'Fluent, but not precise',
  C2: 'Near native',
};

const EXAM_LABEL: Record<TargetExam, string> = {
  NONE: 'No exam',
  IELTS: 'IELTS',
  TOEFL: 'TOEFL',
  CEFR: 'CEFR test',
};

/**
 * Three questions, asked once.
 *
 * Everything here changes what the tutor does the very next turn — the level
 * sets Mochi's voice, the goal sets how big a day is, the hour is the only
 * moment we are allowed to interrupt. Nothing is asked that the app would not
 * immediately act on, which is why there is no third page of preferences.
 */
export function Onboarding({ onDone }: { onDone: (session: SessionState) => void }) {
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<CefrLevel>('A2');
  const [targetLevel, setTargetLevel] = useState<CefrLevel>('B2');
  const [targetExam, setTargetExam] = useState<TargetExam>('NONE');
  const [dailyGoalMinutes, setGoal] = useState<number>(20);
  const [reminderHour, setReminderHour] = useState(19);
  const [followEverywhere, setFollowEverywhere] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function finish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // chrome.permissions.request needs the user gesture that is still live in
    // this handler, so it has to be asked for BEFORE anything is awaited.
    if (followEverywhere) {
      const granted = await chrome.permissions
        .request({ origins: EVERYWHERE_ORIGINS })
        .catch(() => false);
      await send({ type: 'FOLLOW_EVERYWHERE_SET', enabled: granted });
    }

    const res = await send({
      type: 'ONBOARDING_SUBMIT',
      input: {
        level,
        targetLevel,
        targetExam,
        dailyGoalMinutes,
        reminderHour,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    }).catch(() => null);

    setBusy(false);
    if (res && 'session' in res) onDone(res.session);
    else if (res && !res.ok) setError(res.message);
    else setError('Could not save that. Is the backend running?');
  }

  return (
    <form className="wrap" onSubmit={finish}>
      <div className="head">
        <div className="av">🐕</div>
        <div style={{ flex: 1 }}>
          <b>Let's set up Mochi</b>
          <span>Step {step + 1} of 3</span>
        </div>
      </div>

      <div className="bar" style={{ marginTop: 0 }}>
        <i style={{ width: `${((step + 1) / 3) * 100}%` }} />
      </div>

      {step === 0 ? (
        <div className="card">
          <h2>Your English today</h2>
          <div className="chips">
            {CEFR_LEVELS.map((option) => (
              <button
                type="button"
                key={option}
                className={`chip${option === level ? ' on' : ''}`}
                onClick={() => setLevel(option)}
                aria-pressed={option === level}
              >
                {option}
              </button>
            ))}
          </div>
          <p className="hint">{LEVEL_HINT[level]}</p>
        </div>
      ) : null}

      {step === 1 ? (
        <>
          <div className="card">
            <h2>Where you want to get to</h2>
            <div className="chips">
              {CEFR_LEVELS.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`chip${option === targetLevel ? ' on' : ''}`}
                  onClick={() => setTargetLevel(option)}
                  aria-pressed={option === targetLevel}
                >
                  {option}
                </button>
              ))}
            </div>
            <div className="chips" style={{ marginTop: 8 }}>
              {TARGET_EXAMS.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`chip${option === targetExam ? ' on' : ''}`}
                  onClick={() => setTargetExam(option)}
                  aria-pressed={option === targetExam}
                >
                  {EXAM_LABEL[option]}
                </button>
              ))}
            </div>
          </div>

          <div className="card">
            <h2>Minutes a day</h2>
            <div className="chips">
              {GOALS.map((option) => (
                <button
                  type="button"
                  key={option}
                  className={`chip${option === dailyGoalMinutes ? ' on' : ''}`}
                  onClick={() => setGoal(option)}
                  aria-pressed={option === dailyGoalMinutes}
                >
                  {option}m
                </button>
              ))}
            </div>
            <p className="hint">A day's mission is built to fit this.</p>
          </div>
        </>
      ) : null}

      {step === 2 ? (
        <>
          <div className="card">
            <h2>When should Mochi remind you</h2>
            <select
              value={reminderHour}
              onChange={(e) => setReminderHour(Number(e.target.value))}
              aria-label="Reminder hour"
            >
              {Array.from({ length: 24 }, (_, hour) => (
                <option key={hour} value={hour}>
                  {String(hour).padStart(2, '0')}:00
                </option>
              ))}
            </select>
            <p className="hint">At most one reminder a day. You can turn it off later.</p>
          </div>

          <label className="toggle">
            <input
              type="checkbox"
              checked={followEverywhere}
              onChange={(e) => setFollowEverywhere(e.target.checked)}
            />
            <span>
              <b>Let Mochi follow me everywhere</b>
              <small>Otherwise the pet only appears on Google. You can change this later.</small>
            </span>
          </label>
        </>
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="steps">
        {step > 0 ? (
          <button type="button" className="link" onClick={() => setStep(step - 1)}>
            Back
          </button>
        ) : (
          <span />
        )}
        {step < 2 ? (
          <button type="button" className="primary" onClick={() => setStep(step + 1)}>
            Next
          </button>
        ) : (
          <button className="primary" disabled={busy}>
            {busy ? 'Setting up…' : 'Start the 90 days'}
          </button>
        )}
      </div>
    </form>
  );
}
