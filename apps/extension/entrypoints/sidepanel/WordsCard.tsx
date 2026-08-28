import { useState } from 'react';
import type { StudyWord, WordListResponse } from '@pet/shared';
import { send } from '../../src/types/messages.js';

/**
 * The learner's word list.
 *
 * Adding takes a comma-separated line rather than one word at a time, because
 * somebody adding words has a list in front of them — from a lesson, a film, a
 * page they just read. `timesUsed` is shown next to each word: it is the only
 * number here that the learner earned by writing, not by typing a list.
 */
export function WordsCard({
  data,
  onChanged,
}: {
  data: WordListResponse | null;
  onChanged: (next: WordListResponse) => void;
}) {
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showKnown, setShowKnown] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const words = draft
      .split(/[,\n;]/)
      .map((w) => w.trim())
      .filter(Boolean)
      .slice(0, 30);
    if (words.length === 0) return;

    setBusy(true);
    setError(null);
    const res = await send({
      type: 'WORDS_ADD',
      input: { words: words.map((word) => ({ word })) },
    }).catch(() => null);
    setBusy(false);

    if (res && 'words' in res) {
      onChanged(res.words);
      setDraft('');
    } else if (res && !res.ok) setError(res.message);
    else setError('Could not save those.');
  }

  async function update(word: StudyWord, patch: { status?: 'learning' | 'known' }) {
    const res = await send({ type: 'WORD_UPDATE', wordId: word.id, patch }).catch(() => null);
    if (res && 'words' in res) onChanged(res.words);
  }

  async function remove(word: StudyWord) {
    const res = await send({ type: 'WORD_REMOVE', wordId: word.id }).catch(() => null);
    if (res && 'words' in res) onChanged(res.words);
  }

  if (!data) {
    return (
      <div className="card">
        <h2>My words</h2>
        <div className="skeleton" style={{ height: 60 }} />
      </div>
    );
  }

  const shown = data.words.filter((w) => (showKnown ? w.status === 'known' : w.status === 'learning'));

  return (
    <div className="card">
      <h2>My words · {data.counts.learning} learning</h2>

      <form className="word-add" onSubmit={add}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="commute, to postpone, reliable"
          aria-label="Words to learn, separated by commas"
          maxLength={400}
        />
        <button className="primary" disabled={busy || !draft.trim()}>
          {busy ? '…' : 'Add'}
        </button>
      </form>
      <p className="hint-note">
        Mocha uses these in conversation and asks you to use them back.
      </p>

      {error ? <p className="err">{error}</p> : null}

      <div className="word-tabs">
        <button className={showKnown ? '' : 'on'} onClick={() => setShowKnown(false)}>
          Learning ({data.counts.learning})
        </button>
        <button className={showKnown ? 'on' : ''} onClick={() => setShowKnown(true)}>
          Known ({data.counts.known})
        </button>
      </div>

      {shown.length === 0 ? (
        <div className="empty" style={{ padding: '14px 0' }}>
          <p>{showKnown ? 'Nothing marked known yet.' : 'No words yet.'}</p>
          <small>
            {showKnown
              ? 'A word moves here when you say it does.'
              : 'Add the words you keep forgetting.'}
          </small>
        </div>
      ) : (
        <ul className="words">
          {shown.map((word) => (
            <li key={word.id}>
              <span className="w">
                <b>{word.word}</b>
                {word.note ? <small>{word.note}</small> : null}
                {!word.note && word.definition ? <small>{word.definition}</small> : null}
              </span>
              <span className="used" title={`Used ${word.timesUsed} times in your own messages`}>
                {word.timesUsed > 0 ? `${word.timesUsed}×` : '—'}
              </span>
              <button
                className="mark"
                onClick={() => void update(word, { status: word.status === 'known' ? 'learning' : 'known' })}
              >
                {word.status === 'known' ? 'Relearn' : 'Known'}
              </button>
              <button className="x" aria-label={`Remove ${word.word}`} onClick={() => void remove(word)}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
