import { useCallback, useEffect, useRef, useState } from 'react';
import { type PetEvent, type PetState, stateDuration, transition } from '@pet/shared';

/**
 * Binds the pure state machine from @pet/shared to React, and owns the one
 * side effect the machine implies: a transient state must emit ANIMATION_END
 * when its animation is over, or the pet strands itself mid-celebration.
 */
export function usePetMachine(initial: PetState = 'idle') {
  const [state, setState] = useState<PetState>(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dispatch = useCallback((event: PetEvent) => {
    setState((current) => transition(current, event));
  }, []);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const duration = stateDuration(state);
    if (duration === null) return;
    timer.current = setTimeout(() => dispatch('ANIMATION_END'), duration);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [state, dispatch]);

  return { state, dispatch } as const;
}
