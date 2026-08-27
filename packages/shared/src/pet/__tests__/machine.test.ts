import { describe, expect, it } from 'vitest';
import { transition, stateDuration, isTransient } from '../machine.js';
import { PET_EVENTS, PET_STATES } from '../types.js';

describe('pet state machine', () => {
  it('every transient state can reach idle again', () => {
    for (const state of PET_STATES) {
      if (!isTransient(state)) continue;
      expect(transition(state, 'ANIMATION_END')).toBe('idle');
    }
  });

  it('never leaves the declared state set', () => {
    for (const state of PET_STATES) {
      for (const event of PET_EVENTS) {
        expect(PET_STATES).toContain(transition(state, event));
      }
    }
  });

  it('ignores events that are not meaningful in the current state', () => {
    expect(transition('sleeping', 'TICK')).toBe('sleeping');
    expect(transition('celebrating', 'TICK')).toBe('celebrating');
  });

  it('a completed mission always wins over whatever the pet was doing', () => {
    for (const state of PET_STATES) {
      if (state === 'celebrating') continue;
      expect(transition(state, 'MISSION_COMPLETE')).toBe('celebrating');
    }
  });

  it('waking is possible from sleep by mouse or click', () => {
    expect(transition('sleeping', 'MOUSE_NEAR')).toBe('idle');
    expect(transition('sleeping', 'CLICK')).toBe('talking');
  });

  it('gives a duration for transient states only', () => {
    expect(stateDuration('celebrating')).toBeGreaterThan(0);
    expect(stateDuration('idle')).toBeNull();
  });
});
