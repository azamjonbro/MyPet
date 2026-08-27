import { useEffect } from 'react';
import type { PetEvent } from '@pet/shared';

const TICK_MIN_MS = 9_000;
const TICK_MAX_MS = 18_000;
const IDLE_BEFORE_SLEEP_MS = 10 * 60_000; // §H: ten quiet minutes, then the pet naps
const MOUSE_NEAR_PX = 110;
const MOUSE_COOLDOWN_MS = 9_000;

/**
 * The pet's self-driven behaviour: the left-hand transitions in the §H diagram.
 *
 * Everything here pauses when the tab is hidden — a pet animating in a
 * background tab is pure battery cost for zero benefit.
 */
export function useBehaviour(dispatch: (event: PetEvent) => void, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    let lastPoke = Date.now();
    let cooldown = 0;
    let beat: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      beat = setTimeout(tick, TICK_MIN_MS + Math.random() * (TICK_MAX_MS - TICK_MIN_MS));
    };

    const tick = () => {
      if (document.visibilityState === 'visible') {
        if (Date.now() - lastPoke > IDLE_BEFORE_SLEEP_MS) dispatch('IDLE_TIMEOUT');
        else dispatch('TICK');
      }
      schedule();
    };

    const onMouseMove = (e: MouseEvent) => {
      const root = document.getElementById('ai-english-pet-root');
      const box = root?.getBoundingClientRect();
      if (!box) return;
      const dx = e.clientX - (box.left + box.width / 2);
      const dy = e.clientY - (box.top + box.height / 2);
      if (Math.hypot(dx, dy) > MOUSE_NEAR_PX) return;

      lastPoke = Date.now();
      if (Date.now() < cooldown) return;
      cooldown = Date.now() + MOUSE_COOLDOWN_MS;
      dispatch('MOUSE_NEAR');
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') lastPoke = Date.now();
    };

    document.addEventListener('mousemove', onMouseMove, { passive: true });
    document.addEventListener('visibilitychange', onVisibility);
    schedule();

    return () => {
      if (beat) clearTimeout(beat);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [dispatch, enabled]);
}
