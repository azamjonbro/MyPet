import { useCallback, useEffect, useState } from 'react';
import { SKILLS, type MissionResponse, type NotionStatus, type WordListResponse } from '@pet/shared';
import { MissionCard } from './MissionCard.js';
import { NotionCard } from './NotionCard.js';
import { StudyCard } from './StudyCard.js';
import { WordsCard } from './WordsCard.js';
import { send, type ProgressBundle, type Push } from '../../src/types/messages.js';

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; data: ProgressBundle }
  | { kind: 'signed-out' }
  | { kind: 'error'; message: string };

export function Dashboard() {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [mission, setMission] = useState<MissionResponse | null>(null);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [notion, setNotion] = useState<NotionStatus | null>(null);
  const [words, setWords] = useState<WordListResponse | null>(null);

  const loadMission = useCallback(async () => {
    setMissionError(null);
    const res = await send({ type: 'MISSION_GET' }).catch(() => null);
    if (res && 'mission' in res) setMission(res.mission);
    else if (res && !res.ok) setMissionError(res.message);
    else setMissionError('Could not load today.');
  }, []);

  const loadWords = useCallback(async () => {
    const res = await send({ type: 'WORDS_GET' }).catch(() => null);
    if (res && 'words' in res) setWords(res.words);
  }, []);

  const loadNotion = useCallback(async () => {
    const res = await send({ type: 'NOTION_STATUS' }).catch(() => null);
    if (res && 'notion' in res) setNotion(res.notion);
  }, []);

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    const session = await send({ type: 'SESSION_GET' }).catch(() => null);
    if (session && 'session' in session && session.session.status === 'signed-out') {
      setState({ kind: 'signed-out' });
      return;
    }
    const res = await send({ type: 'PROGRESS_GET' }).catch(() => null);
    if (res && 'progress' in res) setState({ kind: 'ready', data: res.progress });
    else if (res && !res.ok) setState({ kind: 'error', message: res.message });
    else setState({ kind: 'error', message: 'Could not load your progress.' });

    await Promise.all([loadMission(), loadNotion(), loadWords()]);
  }, [loadMission, loadNotion, loadWords]);

  useEffect(() => {
    void load();
  }, [load]);

  // A task finished from the pet, the popup or a chat turn changes this page
  // too — re-read rather than let two surfaces drift apart.
  useEffect(() => {
    const onPush = (message: unknown) => {
      if ((message as Push)?.type !== 'MISSION_CHANGED') return;
      void loadMission();
      void load();
    };
    chrome.runtime.onMessage.addListener(onPush);
    return () => chrome.runtime.onMessage.removeListener(onPush);
  }, [loadMission, load]);

  if (state.kind === 'loading') {
    return (
      <div className="wrap">
        <div className="skeleton" style={{ height: 22, width: '55%' }} />
        <div className="skeleton" style={{ height: 96 }} />
        <div className="skeleton" style={{ height: 64 }} />
        <div className="skeleton" style={{ height: 140 }} />
      </div>
    );
  }

  if (state.kind === 'signed-out') {
    return (
      <div className="wrap">
        <div className="empty">
          <span className="e">🐈</span>
          <p>Sign in to see your progress.</p>
          <small>Open the extension popup to get started.</small>
        </div>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="wrap">
        <div className="empty">
          <span className="e">🔌</span>
          <p className="err">{state.message}</p>
          <small>Check the backend is running, then try again.</small>
        </div>
        <button className="primary" onClick={() => void load()}>Try again</button>
      </div>
    );
  }

  const { summary, weaknesses, history } = state.data;
  const pct = Math.round(summary.progress * 100);
  const peak = Math.max(1, ...history.map((d) => d.messages));

  return (
    <div className="wrap">
      <div className="top">
        <h1>Your progress</h1>
        <span className="day">
          {summary.currentDay > 0 ? `Day ${summary.currentDay} / 90` : 'Not started'}
        </span>
      </div>

      {/* Hero: a headline number, deliberately not a chart. */}
      <div className="card">
        <div className="hero">
          <span className="title">{summary.title}</span>
          <span className="lv">Level {summary.level}</span>
        </div>
        <div className="track">
          <i style={{ width: `${pct}%` }} />
        </div>
        <div className="hero-foot">
          <span>{summary.xp.toLocaleString()} XP</span>
          <span>
            {summary.xpForNextLevel > 0
              ? `${(summary.xpForNextLevel - summary.xpIntoLevel).toLocaleString()} to next level`
              : 'Highest level'}
          </span>
        </div>
      </div>

      <MissionCard
        data={mission}
        error={missionError}
        onChanged={() => {
          void loadMission();
          void load();
        }}
        onError={setMissionError}
      />

      <StudyCard
        onFinished={() => {
          void load();
          void loadMission();
        }}
      />

      <div className="tiles">
        <div className={`tile${summary.streak.atRisk ? ' risk' : ''}`}>
          <b>🔥 {summary.streak.current}</b>
          <span>{summary.streak.atRisk ? 'practise today!' : 'day streak'}</span>
        </div>
        <div className="tile">
          <b>{summary.today.messages}</b>
          <span>messages today</span>
        </div>
        <div className="tile">
          <b>{summary.today.corrections}</b>
          <span>fixes today</span>
        </div>
      </div>

      {/* One series, one hue, so no legend — the heading names it. */}
      <div className="card">
        <h2>Messages · last 14 days</h2>
        {history.every((d) => d.messages === 0) ? (
          <div className="empty" style={{ padding: '14px 0' }}>
            <p>No practice logged yet.</p>
            <small>Click Mocha on any page and say hello.</small>
          </div>
        ) : (
          <>
            <div className="bars">
              {history.map((day) => {
                const height = day.messages === 0 ? 2 : Math.max(6, (day.messages / peak) * 100);
                return (
                  <div
                    key={day.localDate}
                    className={`bar-col${day.messages === 0 ? ' empty' : ''}`}
                    tabIndex={0}
                    aria-label={`${day.localDate}: ${day.messages} messages, ${day.corrections} corrections`}
                  >
                    <span className="tip">
                      {day.localDate.slice(5)} · {day.messages} msg
                      {day.corrections > 0 ? ` · ${day.corrections} fixed` : ''}
                    </span>
                    <i style={{ height: `${height}%` }} />
                  </div>
                );
              })}
            </div>
            <div className="bars-axis">
              <span>{history[0]?.localDate.slice(5)}</span>
              <span>today</span>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <h2>Skills</h2>
        {SKILLS.map((skill) => (
          <div className="skill" key={skill}>
            <span>{skill}</span>
            <div className="track">
              <i style={{ width: `${Math.min(100, summary.skills[skill])}%` }} />
            </div>
            <em>{summary.skills[skill]}</em>
          </div>
        ))}
      </div>

      <WordsCard data={words} onChanged={setWords} />

      <NotionCard status={notion} onRefresh={() => void loadNotion()} />

      <div className="card">
        <h2>What to work on</h2>
        {weaknesses.length === 0 ? (
          <div className="empty" style={{ padding: '14px 0' }}>
            <p>Nothing to fix yet.</p>
            <small>Mocha will list your weak spots as you practise.</small>
          </div>
        ) : (
          <div className="weak">
            {weaknesses.map((w) => (
              <div className="weak-row" key={w.topicId}>
                <div className="weak-head">
                  <b>{w.label}</b>
                  <span className="n">{w.count}×</span>
                </div>
                {w.examples.slice(0, 2).map((ex, i) => (
                  <div className="ex" key={i}>
                    <span className="g" aria-hidden="true">❌</span>
                    <s>{ex.original}</s>
                    <span className="g" aria-hidden="true">✅</span>
                    <b>{ex.corrected}</b>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
