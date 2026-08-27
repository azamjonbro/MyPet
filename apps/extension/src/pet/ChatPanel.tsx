import { useEffect, useRef, useState } from 'react';
import { TOPIC_LABEL, type GrammarTopic } from '@pet/shared';
import type { ChatEntry, ChatStatus } from './useChat.js';

interface Props {
  entries: ChatEntry[];
  status: ChatStatus;
  error: string | null;
  muted: boolean;
  onSend: (text: string) => void;
  onRetry: () => void;
  onClose: () => void;
  onToggleMute: () => void;
}

export function ChatPanel({
  entries, status, error, muted, onSend, onRetry, onClose, onToggleMute,
}: Props) {
  const [draft, setDraft] = useState('');
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [entries]);

  return (
    <div
      className="chat"
      role="dialog"
      aria-label="Chat with Mochi"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="chat-head">
        <span className="chat-av" aria-hidden="true">🐕</span>
        <b>Mochi</b>
        <button
          type="button"
          className="icon"
          aria-pressed={muted}
          aria-label={muted ? 'Turn sound on' : 'Turn sound off'}
          onClick={onToggleMute}
        >
          {muted ? '🔇' : '🔊'}
        </button>
        <button type="button" className="icon" aria-label="Close chat" onClick={onClose}>×</button>
      </header>

      <div className="chat-log" ref={logRef}>
        {entries.length === 0 ? (
          <div className="chat-empty">
            <p>Say anything in English.</p>
            <small>Mistakes are welcome — that is the whole point.</small>
          </div>
        ) : null}

        {entries.map((entry) => (
          <div key={entry.id} className="chat-entry">
            <div className={`msg ${entry.role}`}>
              {entry.text || (status === 'sending' ? <Dots /> : null)}
            </div>

            {entry.corrections?.map((c, i) => (
              <div className="fix" key={`${entry.id}-${i}`}>
                <div className="fix-row">
                  <span aria-hidden="true">❌</span>
                  <s>{c.original}</s>
                </div>
                <div className="fix-row">
                  <span aria-hidden="true">✅</span>
                  <b>{c.corrected}</b>
                </div>
                <div className="fix-topic">{TOPIC_LABEL[c.topicId as GrammarTopic]}</div>
                <div className="fix-why">{c.explanation}</div>
              </div>
            ))}

            {entry.followUp ? <div className="followup">Now try: {entry.followUp}</div> : null}
            {entry.xp ? <div className="xp">+{entry.xp} XP</div> : null}
          </div>
        ))}

        {error ? (
          <div className="chat-error" role="alert">
            <p>{error}</p>
            <button type="button" onClick={onRetry}>Try again</button>
          </div>
        ) : null}
      </div>

      <form
        className="chat-compose"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim() || status === 'sending') return;
          onSend(draft);
          setDraft('');
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write in English…"
          aria-label="Your message"
          maxLength={2000}
          autoComplete="off"
        />
        <button type="submit" aria-label="Send" disabled={!draft.trim() || status === 'sending'}>↑</button>
      </form>
    </div>
  );
}

function Dots() {
  return (
    <span className="dots" aria-label="Mochi is thinking">
      <i /><i /><i />
    </span>
  );
}
