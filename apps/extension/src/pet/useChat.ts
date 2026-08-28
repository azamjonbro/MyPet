import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatStreamEvent, Correction } from '@pet/shared';
import { CHAT_PORT, type ChatPortRequest } from '../types/messages.js';
import { sfx } from './sfx.js';

export interface ChatEntry {
  id: string;
  role: 'user' | 'pet';
  text: string;
  corrections?: Correction[];
  xp?: number;
  followUp?: string | null;
  /** A mission line, not something Mochi said — rendered as a chip. */
  notice?: 'task' | 'mission';
}

export type ChatStatus = 'idle' | 'sending' | 'error';

/**
 * Owns one conversation with Mochi over a long-lived port to the service
 * worker. The port is opened lazily on first send and torn down on unmount,
 * so a pet that is never opened costs nothing.
 */
export function useChat(
  onReplyStart: () => void,
  onXp: (amount: number) => void,
  onMissionComplete?: () => void,
) {
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const sessionRef = useRef<string | undefined>(undefined);
  const streamingIdRef = useRef<string | null>(null);
  const blipGate = useRef(0);

  const teardown = useCallback(() => {
    portRef.current?.disconnect();
    portRef.current = null;
  }, []);

  useEffect(() => teardown, [teardown]);

  const handleEvent = useCallback(
    (event: ChatStreamEvent) => {
      switch (event.type) {
        case 'open':
          sessionRef.current = event.sessionId;
          onReplyStart();
          break;

        case 'token': {
          const id = streamingIdRef.current;
          if (!id) break;
          // One tick per few tokens: per-token would be a machine gun.
          if (++blipGate.current % 4 === 0) sfx.blip();
          setEntries((prev) =>
            prev.map((e) => (e.id === id ? { ...e, text: e.text + event.text } : e)),
          );
          break;
        }

        case 'corrections': {
          const id = streamingIdRef.current;
          sfx.fix();
          setEntries((prev) =>
            prev.map((e) => (e.id === id ? { ...e, corrections: event.corrections } : e)),
          );
          break;
        }

        case 'done': {
          const id = streamingIdRef.current;
          setEntries((prev) =>
            prev.map((e) =>
              e.id === id ? { ...e, xp: event.xpAwarded, followUp: event.followUp } : e,
            ),
          );
          if (event.xpAwarded > 0) {
            sfx.xp();
            onXp(event.xpAwarded);
          }
          streamingIdRef.current = null;
          setStatus('idle');
          break;
        }

        case 'error': {
          const id = streamingIdRef.current;
          setEntries((prev) => prev.filter((e) => e.id !== id || e.text.length > 0));
          streamingIdRef.current = null;
          setError(event.message);
          setStatus('error');
          break;
        }

        case 'mission': {
          // The turn just finished part of today. Saying so here, in the same
          // place the work happened, is what makes a mission feel like the
          // conversation rather than a checklist somewhere else.
          const lines: ChatEntry[] = event.completedTasks.map((task) => ({
            id: crypto.randomUUID(),
            role: 'pet' as const,
            text: `✓ ${task.title} · +${task.xp} XP`,
            notice: 'task' as const,
          }));
          if (event.missionCompleted) {
            lines.push({
              id: crypto.randomUUID(),
              role: 'pet',
              text: "🎉 Today's mission is done!",
              notice: 'mission',
            });
            sfx.celebrate();
            onMissionComplete?.();
          }
          setEntries((prev) => [...prev, ...lines]);
          break;
        }

        case 'vocab':
          break;
      }
    },
    [onReplyStart, onXp, onMissionComplete],
  );

  const ensurePort = useCallback((): chrome.runtime.Port => {
    if (portRef.current) return portRef.current;
    const port = chrome.runtime.connect({ name: CHAT_PORT });
    port.onMessage.addListener((raw) => handleEvent(raw as ChatStreamEvent));
    port.onDisconnect.addListener(() => {
      portRef.current = null;
      if (streamingIdRef.current) {
        streamingIdRef.current = null;
        setError('Mochi lost the connection. Try again.');
        setStatus('error');
      }
    });
    portRef.current = port;
    return port;
  }, [handleEvent]);

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === 'sending') return;

      setError(null);
      setStatus('sending');
      sfx.send();

      const petId = crypto.randomUUID();
      streamingIdRef.current = petId;
      setEntries((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', text: trimmed },
        { id: petId, role: 'pet', text: '' },
      ]);

      const request: ChatPortRequest = {
        type: 'send',
        text: trimmed,
        ...(sessionRef.current ? { sessionId: sessionRef.current } : {}),
      };
      ensurePort().postMessage(request);
    },
    [ensurePort, status],
  );

  const retry = useCallback(() => {
    const lastUser = [...entries].reverse().find((e) => e.role === 'user');
    setError(null);
    setStatus('idle');
    if (lastUser) send(lastUser.text);
  }, [entries, send]);

  return { entries, status, error, send, retry } as const;
}
