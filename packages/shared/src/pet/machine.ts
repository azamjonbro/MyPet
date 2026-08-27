import { type PetEvent, type PetState, TRANSIENT_STATES } from './types.js';

/**
 * Pure transition function: (state, event) -> state.
 *
 * Kept pure and dependency-free so it is trivially unit-testable and so both
 * the content script and the background worker can agree on what the pet
 * should be doing without sharing a runtime.
 */
const TRANSITIONS: Record<PetState, Partial<Record<PetEvent, PetState>>> = {
  idle: {
    TICK: 'walking',
    MOUSE_NEAR: 'happy',
    CLICK: 'talking',
    CHAT_OPEN: 'talking',
    IDLE_TIMEOUT: 'sleeping',
    MISSION_DUE: 'notifying',
    XP_AWARDED: 'happy',
    TASK_DONE: 'happy',
    MISSION_COMPLETE: 'celebrating',
    STREAK_AT_RISK: 'sad',
    SLEEP: 'sleeping',
  },
  walking: {
    ANIMATION_END: 'idle',
    CLICK: 'talking',
    CHAT_OPEN: 'talking',
    MISSION_DUE: 'notifying',
    MISSION_COMPLETE: 'celebrating',
    STREAK_AT_RISK: 'sad',
  },
  talking: {
    CHAT_CLOSE: 'idle',
    MISSION_COMPLETE: 'celebrating',
    XP_AWARDED: 'happy',
    TASK_DONE: 'happy',
  },
  happy: {
    ANIMATION_END: 'idle',
    CHAT_OPEN: 'talking',
    MISSION_COMPLETE: 'celebrating',
  },
  celebrating: {
    ANIMATION_END: 'idle',
    CHAT_OPEN: 'talking',
  },
  sad: {
    MOUSE_NEAR: 'idle',
    CLICK: 'talking',
    CHAT_OPEN: 'talking',
    TASK_DONE: 'happy',
    MISSION_COMPLETE: 'celebrating',
    ANIMATION_END: 'idle',
  },
  sleeping: {
    MOUSE_NEAR: 'idle',
    CLICK: 'talking',
    CHAT_OPEN: 'talking',
    WAKE: 'idle',
    MISSION_DUE: 'notifying',
    MISSION_COMPLETE: 'celebrating',
    TASK_DONE: 'happy',
  },
  notifying: {
    ANIMATION_END: 'idle',
    CLICK: 'talking',
    CHAT_OPEN: 'talking',
    MISSION_COMPLETE: 'celebrating',
  },
};

export function transition(state: PetState, event: PetEvent): PetState {
  return TRANSITIONS[state][event] ?? state;
}

/** How long a transient state plays before it should emit ANIMATION_END. */
export function stateDuration(state: PetState): number | null {
  return TRANSIENT_STATES[state] ?? null;
}

export function isTransient(state: PetState): boolean {
  return state in TRANSIENT_STATES;
}
