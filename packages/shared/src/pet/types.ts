/** The pet's finite state machine. Lives in shared so the backend can reason
 *  about which reaction to push to an open pet (§H of the audit). */

export const PET_STATES = [
  'idle',
  'walking',
  'talking',
  'happy',
  'celebrating',
  'sad',
  'sleeping',
  'notifying',
] as const;
export type PetState = (typeof PET_STATES)[number];

export const PET_EVENTS = [
  'TICK',            // behaviour loop heartbeat
  'MOUSE_NEAR',
  'CLICK',
  'CHAT_OPEN',
  'CHAT_CLOSE',
  'IDLE_TIMEOUT',
  'ANIMATION_END',
  'MISSION_DUE',     // pushed from the service worker
  'TASK_DONE',
  'XP_AWARDED',
  'MISSION_COMPLETE',
  'STREAK_AT_RISK',
  'SLEEP',
  'WAKE',
] as const;
export type PetEvent = (typeof PET_EVENTS)[number];

/** States that play once and then fall back to idle. Value is duration in ms. */
export const TRANSIENT_STATES: Partial<Record<PetState, number>> = {
  happy: 900,
  celebrating: 1400,
  notifying: 2600,
};

export interface PetSkin {
  id: string;
  name: string;
  /** Which renderer implementation draws this skin. */
  renderer: 'svg' | 'sprite' | 'lottie';
  /** Per-state asset or animation key. Unused by the built-in svg renderer. */
  assets?: Partial<Record<PetState, string>>;
}
