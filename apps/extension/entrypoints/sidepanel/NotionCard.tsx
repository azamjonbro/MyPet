import { useState } from 'react';
import { NOTION_TARGETS, NOTION_TARGET_LABEL, type NotionStatus } from '@pet/shared';
import { send } from '../../src/types/messages.js';

/**
 * Notion.
 *
 * The extension never sees a Notion token — connecting opens a normal tab, the
 * backend does the exchange, and everything here is a status read plus a Sync
 * button. Which is also why "connected" can only be discovered by asking the
 * server, never by looking at anything stored locally.
 */
export function NotionCard({
  status,
  onRefresh,
}: {
  status: NotionStatus | null;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<null | 'sync' | 'connect' | 'disconnect'>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!status) {
    return (
      <div className="card">
        <h2>Notion</h2>
        <div className="skeleton" style={{ height: 44 }} />
      </div>
    );
  }

  if (!status.configured) {
    return (
      <div className="card">
        <h2>Notion</h2>
        <div className="empty" style={{ padding: '14px 0' }}>
          <p>Not available on this server.</p>
          <small>Set NOTION_CLIENT_ID, NOTION_CLIENT_SECRET and ENCRYPTION_KEY to switch it on.</small>
        </div>
      </div>
    );
  }

  const pending =
    status.pendingCounts.vocabulary + status.pendingCounts.mistakes + status.pendingCounts.missions;

  async function run(action: 'sync' | 'connect' | 'disconnect') {
    setBusy(action);
    setError(null);
    setMessage(null);

    const res = await send(
      action === 'sync'
        ? { type: 'NOTION_SYNC' }
        : action === 'connect'
          ? { type: 'NOTION_CONNECT' }
          : { type: 'NOTION_DISCONNECT' },
    ).catch(() => null);

    setBusy(null);

    if (res && 'sync' in res) {
      const total = res.sync.synced.vocabulary + res.sync.synced.mistakes + res.sync.synced.missions;
      setMessage(total === 0 ? 'Everything was already there.' : `Sent ${total} to Notion.`);
    } else if (res && !res.ok) {
      setError(res.message);
    } else if (!res) {
      setError('Could not reach the extension worker.');
    }
    onRefresh();
  }

  return (
    <div className="card">
      <h2>Notion</h2>

      {status.connected ? (
        <>
          <div className="notion-head">
            <b>{status.workspaceName ?? 'Your workspace'}</b>
            <span>
              {status.lastSyncedAt
                ? `Last sync ${new Date(status.lastSyncedAt).toLocaleDateString()}`
                : 'Never synced'}
            </span>
          </div>

          <ul className="notion-rows">
            {NOTION_TARGETS.map((target) => (
              <li key={target}>
                <span>{NOTION_TARGET_LABEL[target]}</span>
                <em>
                  {status.pendingCounts[target] > 0
                    ? `${status.pendingCounts[target]} waiting`
                    : status.databases[target]
                      ? 'up to date'
                      : 'not created yet'}
                </em>
              </li>
            ))}
          </ul>

          {message ? <p className="ok-note">{message}</p> : null}
          {error ? <p className="err">{error}</p> : null}

          <div className="notion-actions">
            <button className="primary" disabled={busy !== null} onClick={() => void run('sync')}>
              {busy === 'sync' ? 'Syncing…' : pending > 0 ? `Sync ${pending}` : 'Sync'}
            </button>
            <button className="ghost" disabled={busy !== null} onClick={() => void run('disconnect')}>
              Disconnect
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="focus">
            Keep your words, your corrections and your finished days in your own Notion.
          </p>
          {error ? <p className="err">{error}</p> : null}
          <button className="primary" disabled={busy !== null} onClick={() => void run('connect')}>
            {busy === 'connect' ? 'Opening Notion…' : 'Connect Notion'}
          </button>
          <p className="hint-note">
            Share one Notion page with the integration — that page is where the databases go.
          </p>
        </>
      )}
    </div>
  );
}
