import type { PetEvent, PetState } from '@pet/shared';

/**
 * The worker pushes the state it wants the pet in; the pet only accepts events.
 *
 * Going through an event rather than assigning the state directly means a push
 * still has to be legal in the machine — the worker cannot, for example, drag a
 * mid-celebration pet into `sad` and strand the animation.
 */
export function pushToEvent(state: PetState): PetEvent {
  switch (state) {
    case 'celebrating': return 'MISSION_COMPLETE';
    case 'notifying':   return 'MISSION_DUE';
    case 'sad':         return 'STREAK_AT_RISK';
    case 'happy':       return 'XP_AWARDED';
    case 'talking':     return 'CHAT_OPEN';
    case 'sleeping':    return 'SLEEP';
    case 'walking':     return 'TICK';
    case 'idle':        return 'WAKE';
  }
}
