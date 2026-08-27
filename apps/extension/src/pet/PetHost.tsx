import { useCallback, useEffect, useRef, useState } from 'react';
import { PetSprite } from './PetSprite.js';
import { usePetMachine } from './usePetMachine.js';
import { useBehaviour } from './useBehaviour.js';
import { pushToEvent } from './pushToEvent.js';
import { send } from '../types/messages.js';
import type { Push } from '../types/messages.js';

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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function PetHost() {
  const { state, dispatch } = usePetMachine('idle');
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [ready, setReady] = useState(false);
  const [bubble, setBubble] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ px: number; py: number; ox: number; oy: number; moved: boolean } | null>(null);
  const bubbleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const host = location.hostname;

  // Restore the last position for this site, falling back to bottom-right.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const res = await send({ type: 'PET_POSITION_GET', host }).catch(() => null);
      const saved = res && 'position' in res ? res.position : null;
      if (cancelled) return;
      setPos({
        x: clamp(saved?.x ?? innerWidth - PET_W - 30, MARGIN, Math.max(MARGIN, innerWidth - PET_W - MARGIN)),
        y: clamp(saved?.y ?? innerHeight - PET_H - 50, MARGIN, Math.max(MARGIN, innerHeight - PET_H - MARGIN)),
      });
      setReady(true);
    })();
    return () => { cancelled = true; };
  }, [host]);

  const say = useCallback((text: string, holdMs = 4200) => {
    setBubble(text);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), holdMs);
  }, []);

  useBehaviour(dispatch, ready);

  // Reactions pushed from the service worker (§H, right-hand transitions).
  useEffect(() => {
    const onPush = (message: unknown) => {
      const push = message as Push;
      if (push?.type === 'PET_STATE') dispatch(pushToEvent(push.state));
    };
    chrome.runtime.onMessage.addListener(onPush);
    return () => chrome.runtime.onMessage.removeListener(onPush);
  }, [dispatch]);

  // Keep the pet on screen when the window is resized.
  useEffect(() => {
    const onResize = () =>
      setPos((p) => ({
        x: clamp(p.x, MARGIN, Math.max(MARGIN, innerWidth - PET_W - MARGIN)),
        y: clamp(p.y, MARGIN, Math.max(MARGIN, innerHeight - PET_H - MARGIN)),
      }));
    addEventListener('resize', onResize);
    return () => removeEventListener('resize', onResize);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    drag.current = { px: e.clientX, py: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.px;
    const dy = e.clientY - d.py;
    if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD_PX) d.moved = true;
    setPos({
      x: clamp(d.ox + dx, MARGIN, Math.max(MARGIN, innerWidth - PET_W - MARGIN)),
      y: clamp(d.oy + dy, MARGIN, Math.max(MARGIN, innerHeight - PET_H - MARGIN)),
    });
  };

  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.moved) {
      void send({ type: 'PET_POSITION_SET', host, x: pos.x, y: pos.y });
      return;
    }
    // A tap, not a drag.
    dispatch('CLICK');
    say(GREETINGS[Math.floor(Math.random() * GREETINGS.length)] ?? GREETINGS[0]!);
  };

  if (!ready) return null;

  return (
    <div
      ref={rootRef}
      className="pet-root"
      style={{ left: `${pos.x}px`, top: `${pos.y}px` }}
    >
      {bubble ? <div className="bubble" role="status">{bubble}</div> : null}
      <button
        type="button"
        className="pet-tap"
        aria-label="Mochi, your English pet. Activate to chat."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            dispatch('CLICK');
            say(GREETINGS[0]!);
          }
        }}
      >
        <PetSprite state={state} />
      </button>
    </div>
  );
}
