import { useEffect, useState } from 'react';
import { NAG_LEVELS, type MeResponse, type NagLevel, type UpdateSettingsRequest } from '@pet/shared';
import { EVERYWHERE_ORIGINS } from '../../src/services/hostAccess.js';
import { send, type SessionState } from '../../src/types/messages.js';

/**
 * Settings.
 *
 * Every switch here sends only the field that moved, and re-renders from what
 * the server sends back rather than from local state — so two open surfaces
 * can never disagree about whether reminders are on.
 */
export function Settings({
  me,
  onSession,
  onBack,
}: {
  me: MeResponse;
  onSession: (session: SessionState) => void;
  onBack: () => void;
}) {
  const settings = me.user.settings;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [everywhere, setEverywhere] = useState<boolean | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await send({ type: 'FOLLOW_EVERYWHERE_GET' }).catch(() => null);
      setEverywhere(res && 'enabled' in res ? res.enabled : false);
    })();
  }, []);

  async function patch(update: UpdateSettingsRequest) {
    setBusy(true);
    setError(null);
    const res = await send({ type: 'SETTINGS_UPDATE', patch: update }).catch(() => null);
    setBusy(false);
    if (res && 'session' in res) onSession(res.session);
    else if (res && !res.ok) setError(res.message);
    else setError('Could not save that.');
  }

  async function toggleEverywhere(next: boolean) {
    // Granting has to happen in this click; revoking can go through the worker.
    if (next) {
      const granted = await chrome.permissions
        .request({ origins: EVERYWHERE_ORIGINS })
        .catch(() => false);
      await send({ type: 'FOLLOW_EVERYWHERE_SET', enabled: granted });
      setEverywhere(granted);
      return;
    }
    const res = await send({ type: 'FOLLOW_EVERYWHERE_SET', enabled: false }).catch(() => null);
    setEverywhere(res && 'enabled' in res ? res.enabled : false);
  }

  return (
    <div className="wrap">
      <div className="head">
        <button className="link" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <b style={{ flex: 1, textAlign: 'right' }}>Settings</b>
      </div>

      <div className="card">
        <h2>Reminders</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.notifications.missionReminder}
            disabled={busy}
            onChange={(e) => void patch({ notifications: { missionReminder: e.target.checked } })}
          />
          <span>
            <b>Daily mission</b>
            <small>One reminder, at the hour you choose.</small>
          </span>
        </label>

        <label className="field">
          <span>Time</span>
          <select
            value={settings.notifications.reminderHour}
            disabled={busy || !settings.notifications.missionReminder}
            onChange={(e) =>
              void patch({ notifications: { reminderHour: Number(e.target.value) } })
            }
          >
            {Array.from({ length: 24 }, (_, hour) => (
              <option key={hour} value={hour}>
                {String(hour).padStart(2, '0')}:00
              </option>
            ))}
          </select>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.notifications.streakAtRisk}
            disabled={busy}
            onChange={(e) => void patch({ notifications: { streakAtRisk: e.target.checked } })}
          />
          <span>
            <b>Streak about to break</b>
            <small>Only in the evening, and only if it really is.</small>
          </span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.notifications.quietMode}
            disabled={busy}
            onChange={(e) => void patch({ notifications: { quietMode: e.target.checked } })}
          />
          <span>
            <b>Quiet mode</b>
            <small>No notifications at all until you turn this off.</small>
          </span>
        </label>
      </div>

      <div className="card">
        <h2>The pet</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.petEnabled}
            disabled={busy}
            onChange={(e) => void patch({ petEnabled: e.target.checked })}
          />
          <span>
            <b>Show Mocha on pages</b>
            <small>Chat still works from the dashboard.</small>
          </span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={everywhere ?? false}
            disabled={everywhere === null}
            onChange={(e) => void toggleEverywhere(e.target.checked)}
          />
          <span>
            <b>Follow me everywhere</b>
            <small>Off: Mocha only appears on Google.</small>
          </span>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.notifications.arrivalToast}
            disabled={busy}
            onChange={(e) => void patch({ notifications: { arrivalToast: e.target.checked } })}
          />
          <span>
            <b>Say hello on a new page</b>
            <small>A small bubble when Mocha arrives.</small>
          </span>
        </label>
      </div>

      <div className="card">
        <h2>Accountability</h2>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.accountability.enabled}
            disabled={busy}
            onChange={(e) => void patch({ accountability: { enabled: e.target.checked } })}
          />
          <span>
            <b>Keep me honest</b>
            <small>Mocha notices when the day goes by with no English in it.</small>
          </span>
        </label>

        <div className="field" style={{ display: 'block' }}>
          <span style={{ display: 'block', marginBottom: 6 }}>How hard to push</span>
          <div className="chips">
            {NAG_LEVELS.map((level) => (
              <button
                type="button"
                key={level}
                className={`chip${settings.accountability.intensity === level ? ' on' : ''}`}
                disabled={busy || !settings.accountability.enabled}
                onClick={() => void patch({ accountability: { intensity: level as NagLevel } })}
              >
                {level === 'LOW' ? 'Gentle' : level === 'NORMAL' ? 'Normal' : 'Relentless'}
              </button>
            ))}
          </div>
          <p className="hint">
            {settings.accountability.intensity === 'LOW'
              ? 'One nudge a day, no streak warnings.'
              : settings.accountability.intensity === 'NORMAL'
                ? 'Up to two nudges a day.'
                : 'Up to three, and Mocha asks again later in the evening.'}
          </p>
        </div>

        <label className="field">
          <span>A day counts if I do</span>
          <select
            value={settings.accountability.minMinutes}
            disabled={busy || !settings.accountability.enabled}
            onChange={(e) =>
              void patch({ accountability: { minMinutes: Number(e.target.value) } })
            }
          >
            {[10, 15, 20, 30, 45, 60].map((minutes) => (
              <option key={minutes} value={minutes}>{minutes} minutes</option>
            ))}
          </select>
        </label>

        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.accountability.emailEnabled}
            disabled={busy || !settings.accountability.enabled}
            onChange={(e) => void patch({ accountability: { emailEnabled: e.target.checked } })}
          />
          <span>
            <b>Email me if I skip the whole day</b>
            <small>One email, after your cut-off hour. Never twice for the same day.</small>
          </span>
        </label>

        {settings.accountability.emailEnabled ? (
          <>
            <label className="field">
              <span>Send to</span>
              <input
                type="email"
                defaultValue={settings.accountability.email}
                placeholder="you@example.com"
                disabled={busy}
                onBlur={(e) => {
                  const email = e.target.value.trim();
                  if (email !== settings.accountability.email) {
                    void patch({ accountability: { email } });
                  }
                }}
              />
            </label>
            <label className="field">
              <span>After</span>
              <select
                value={settings.accountability.cutoffHour}
                disabled={busy}
                onChange={(e) =>
                  void patch({ accountability: { cutoffHour: Number(e.target.value) } })
                }
              >
                {Array.from({ length: 12 }, (_, i) => i + 12).map((hour) => (
                  <option key={hour} value={hour}>{String(hour).padStart(2, '0')}:00</option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      <div className="card">
        <h2>Muted sites</h2>
        {settings.blockedHosts.length === 0 ? (
          <p className="hint" style={{ margin: 0 }}>
            None. Mute a site from the pet's own menu.
          </p>
        ) : (
          <div className="hosts">
            {settings.blockedHosts.map((host) => (
              <span className="host" key={host}>
                {host}
                <button
                  className="x"
                  aria-label={`Unmute ${host}`}
                  disabled={busy}
                  onClick={() =>
                    void patch({
                      blockedHosts: settings.blockedHosts.filter((h) => h !== host),
                    })
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {error ? <p className="error">{error}</p> : null}
    </div>
  );
}
