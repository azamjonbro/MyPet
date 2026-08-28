import { useState } from 'react';
import {
  MAX_CUSTOM_TASKS_PER_DAY,
  isServerVerified,
  type MissionResponse,
  type MissionTask,
} from '@pet/shared';
import { send } from '../../src/types/messages.js';

const KIND_ICON: Record<MissionTask['kind'], string> = {
  chat: '💬',
  vocab: '📖',
  fix: '🎯',
  write: '✍️',
  read: '📰',
  listen: '🎧',
  speak: '🗣️',
  usewords: '⭐',
  own: '📌',
};

/**
 * Today, with its evidence.
 *
 * A task the server verifies shows a count rather than a button, so the
 * difference between "Mocha is watching this" and "you tell me" is visible
 * rather than something the learner has to discover by pressing.
 */
export function MissionCard({
  data,
  error,
  onChanged,
  onError,
}: {
  data: MissionResponse | null;
  error: string | null;
  onChanged: () => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);

  async function addOwn(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim();
    if (!title) return;
    setBusy(true);
    const res = await send({ type: 'MISSION_TASK_ADD', task: { title } }).catch(() => null);
    setBusy(false);
    if (res && 'mission' in res) {
      setDraft('');
      onChanged();
    } else if (res && !res.ok) onError(res.message);
  }

  async function removeOwn(taskId: string) {
    const res = await send({ type: 'MISSION_TASK_REMOVE', taskId }).catch(() => null);
    if (res && 'mission' in res) onChanged();
    else if (res && !res.ok) onError(res.message);
  }

  async function complete(taskId: string) {
    const res = await send({ type: 'MISSION_TASK_COMPLETE', taskId }).catch(() => null);
    if (res && 'task' in res) onChanged();
    else if (res && !res.ok) onError(res.message);
    else onError('Could not save that.');
  }

  if (error) {
    return (
      <div className="card">
        <h2>Today</h2>
        <p className="err">{error}</p>
        <button className="primary" onClick={onChanged}>Try again</button>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="card">
        <h2>Today</h2>
        <div className="skeleton" style={{ height: 72 }} />
      </div>
    );
  }

  const { mission, completionBonus } = data;
  const done = mission.tasks.filter((task) => task.done).length;

  return (
    <div className="card">
      <h2>Today · {mission.title}</h2>
      <p className="focus">{mission.focus}</p>

      <ul className="tasks">
        {mission.tasks.map((task) => (
          <li key={task.id} className={task.done ? 'done' : ''}>
            <span className="ic" aria-hidden="true">{KIND_ICON[task.kind]}</span>
            <span className="t">
              <b>{task.title}</b>
              <small>{task.detail}</small>
            </span>
            {task.done ? (
              <span className="tick" aria-label="done">✓</span>
            ) : isServerVerified(task.kind) ? (
              <span className="count" aria-label={`${task.progress} of ${task.target}`}>
                {task.progress}/{task.target}
              </span>
            ) : (
              <button className="mark" onClick={() => void complete(task.id)}>
                Done
              </button>
            )}
            {task.kind === 'own' && !task.done ? (
              <button
                className="x"
                aria-label={`Remove "${task.title}"`}
                onClick={() => void removeOwn(task.id)}
              >
                ×
              </button>
            ) : null}
          </li>
        ))}
      </ul>

      {mission.tasks.filter((task) => task.kind === 'own').length < MAX_CUSTOM_TASKS_PER_DAY ? (
        <form className="word-add" onSubmit={addOwn} style={{ marginTop: 10 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add your own task for today"
            aria-label="Your own task"
            maxLength={90}
          />
          <button className="primary" disabled={busy || !draft.trim()}>
            {busy ? '…' : 'Add'}
          </button>
        </form>
      ) : null}

      <div className="mission-foot">
        <span>
          {mission.status === 'complete'
            ? `Finished · +${mission.xpAwarded} XP today`
            : `${done} of ${mission.tasks.length} done`}
        </span>
        <span>{mission.status === 'complete' ? '🎉' : `+${completionBonus} XP when it's all done`}</span>
      </div>
    </div>
  );
}
