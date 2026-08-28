import { useCallback, useEffect, useRef, useState } from 'react';
import { PetSprite } from './PetSprite.js';
import { ChatPanel } from './ChatPanel.js';
import { usePetMachine } from './usePetMachine.js';
import { useBehaviour } from './useBehaviour.js';
import { useChat } from './useChat.js';
import { pushToEvent } from './pushToEvent.js';
import { sfx, soundForState } from './sfx.js';
import { send } from '../types/messages.js';
import type { Push, SessionState } from '../types/messages.js';

const PET_W = 150;
const PET_H = 150;
const MARGIN = 8;
const DRAG_THRESHOLD_PX = 5;

const GREETINGS = [
  "Hi! I'm Mochi.",
  'Ask me anything in English.',
  'Want three new words?',
  'Tell me about your day.',
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const maxX = () => Math.max(MARGIN, innerWidth - PET_W - MARGIN);
const maxY = () => Math.max(MARGIN, innerHeight - PET_H - MARGIN);

export function PetHost() {
  const { state, dispatch } = usePetMachine('idle');
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousState = useRef(state);

  const host = location.hostname;

  const say = useCallback((text: string, holdMs = 4200) => {
    sfx.pop();
    setBubble(text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), holdMs);
  }, []);

  const chat = useChat(
    useCallback(() => dispatch('CHAT_OPEN'), [dispatch]),
    useCallback(() => dispatch('XP_AWARDED'), [dispatch]),
    useCallback(() => dispatch('MISSION_COMPLETE'), [dispatch]),
  );

  // Restore this site's last pet position, falling back to bottom-right.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await sfx.init();

      // Settings decide whether the pet may be here at all. Checked in the
      // content script rather than the worker because "muted on this site" is
      // a fact about this page, and the worker does not know which page it is.
      const session = await send({ type: 'SESSION_GET' }).catch(() => null);
      const state = session && 'session' in session ? (session.session as SessionState) : null;
      const settings = state?.status === 'signed-in' ? state.me.user.settings : null;
      const welcome =
        settings?.notifications.arrivalToast === true && state?.status === 'signed-in';
      if (settings && (!settings.petEnabled || settings.blockedHosts.includes(host))) {
        if (!cancelled) setAllowed(false);
        return;
      }

      const res = await send({ type: 'PET_POSITION_GET', host }).catch(() => null);
      const saved = res && 'position' in res ? res.position : null;
      if (cancelled) return;
      setAllowed(true);
      setMuted(sfx.muted);
      setPos({
        x: clamp(saved?.x ?? innerWidth - PET_W - 30, MARGIN, maxX()),
        y: clamp(saved?.y ?? innerHeight - PET_H - 50, MARGIN, maxY()),
      });
      setReady(true);

      // A hello on arrival, if the learner left that on. Late enough that it
      // does not compete with the page still painting.
      if (welcome) {
        setTimeout(() => {
          if (!cancelled) say(GREETINGS[Math.floor(Math.random() * GREETINGS.length)] ?? GREETINGS[0]!);
        }, 2600);
      }
    })();
    return () => {
      cancelled = true;
      if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    };
  }, [host]);

  // A state the pet just entered gets its sound, once.
  useEffect(() => {
    if (previousState.current === state) return;
    previousState.current = state;
    soundForState(state)?.();
  }, [state]);

  useBehaviour(dispatch, ready && !chatOpen);

  // Reactions pushed from the service worker (§H, right-hand transitions).
  useEffect(() => {
    const onPush = (message: unknown) => {
      const push = message as Push;
      if (push?.type === 'PET_STATE') dispatch(pushToEvent(push.state));
      if (push?.type === 'MISSION_CHANGED' && push.remaining !== null && push.remaining > 0) {
        dispatch('MISSION_DUE');
        say(
          push.remaining === 1
            ? 'One task left today.'
            : `${push.remaining} tasks left today.`,
        );
      }
    };
    chrome.runtime.onMessage.addListener(onPush);
    return () => chrome.runtime.onMessage.removeListener(onPush);
  }, [dispatch, say]);

  useEffect(() => {
    const onResize = () =>
      setPos((p) => ({ x: clamp(p.x, MARGIN, maxX()), y: clamp(p.y, MARGIN, maxY()) }));
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const openChat = useCallback(() => {
    setBubble(null);
    setChatOpen(true);
    dispatch('CHAT_OPEN');
  }, [dispatch]);

  const closeChat = useCallback(() => {
    setChatOpen(false);
    dispatch('CHAT_CLOSE');
  }, [dispatch]);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    // Audio cannot start without a gesture, and this is the first one we get.
    sfx.unlock();
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) d.moved = true;
    setPos({ x: clamp(d.ox + dx, MARGIN, maxX()), y: clamp(d.oy + dy, MARGIN, maxY()) });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      void send({ type: 'PET_POSITION_SET', host, x: pos.x, y: pos.y });
      return;
    }
    if (chatOpen) {
      dispatch('CLICK');
      say(GREETINGS[Math.floor(Math.random() * GREETINGS.length)] ?? GREETINGS[0]!);
    } else {
      openChat();
    }
  };

  if (allowed === false) return null;
  if (!ready) return null;

  return (
    <div className="pet-root" style={{ left: `${pos.x}px`, top: `${pos.y}px` }}>
      {bubble && !chatOpen ? <div className="bubble" role="status">{bubble}</div> : null}

      {chatOpen ? (
        <ChatPanel
          entries={chat.entries}
          status={chat.status}
          error={chat.error}
          muted={muted}
          onSend={chat.send}
          onRetry={chat.retry}
          onClose={closeChat}
          onToggleMute={() => {
            const next = !muted;
            setMuted(next);
            void sfx.setMuted(next);
            if (!next) sfx.chirp();
          }}
        />
      ) : null}

      <button
        type="button"
        className="pet-tap"
        aria-label={chatOpen ? 'Mochi' : 'Mochi, your English pet. Activate to chat.'}
        aria-expanded={chatOpen}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            sfx.unlock();
            if (!chatOpen) openChat();
          }
        }}
      >
        <PetSprite state={state} />
      </button>
    </div>
  );
}
