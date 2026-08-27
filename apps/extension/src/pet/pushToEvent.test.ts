import { describe, expect, it } from 'vitest';
import { PET_STATES, transition } from '@pet/shared';
import { pushToEvent } from './pushToEvent.js';

describe('worker push → pet event', () => {
  it('maps every pet state to an event', () => {
    for (const state of PET_STATES) {
      expect(pushToEvent(state)).toBeTypeOf('string');
    }
  });

  it('a push from idle actually lands in the state the worker asked for', () => {
    // idle is where the pet spends most of its life, so this is the case that matters.
    for (const wanted of PET_STATES) {
      if (wanted === 'idle') continue;
      expect(transition('idle', pushToEvent(wanted))).toBe(wanted);
    }
  });

  it('cannot strand a celebrating pet — the machine still arbitrates', () => {
    // The worker asks for `sad` mid-celebration; the machine declines,
    // and the celebration is allowed to finish.
    expect(transition('celebrating', pushToEvent('sad'))).toBe('celebrating');
    expect(transition('celebrating', 'ANIMATION_END')).toBe('idle');
  });
});
