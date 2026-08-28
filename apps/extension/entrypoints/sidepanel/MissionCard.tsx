import { isServerVerified, type MissionResponse, type MissionTask } from '@pet/shared';
import { send } from '../../src/types/messages.js';

const KIND_ICON: Record<MissionTask['kind'], string> = {
  chat: '💬',
  vocab: '📖',
  fix: '🎯',
  write: '✍️',
  read: '📰',
  speak: '🗣️',
};

/**
 * Today, with its evidence.
 *
 * A task the server verifies shows a count rather than a button, so the
 * difference between "Mochi is watching this" and "you tell me" is visible
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
          </li>
        ))}
      </ul>

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
