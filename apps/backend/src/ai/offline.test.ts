import { describe, expect, it } from 'vitest';
import { detectAction } from './offline.js';

const TODAY = '2026-08-29';

describe('reading an instruction out of a message, with no model', () => {
  it('sets a reminder from a plain sentence', () => {
    const action = detectAction('Remind me to check the SEO at 7pm', TODAY);
    expect(action.type).toBe('CREATE_REMINDER');
    expect(action.title).toBe('check the SEO');
    expect(action.dueAtLocal).toBe('2026-08-29T19:00');
  });

  it('reads "at 7" in a study app as the evening', () => {
    expect(detectAction('remind me to study at 7', TODAY).dueAtLocal).toBe('2026-08-29T19:00');
    expect(detectAction('remind me to study at 7am', TODAY).dueAtLocal).toBe('2026-08-29T07:00');
    expect(detectAction('remind me to study at 11', TODAY).dueAtLocal).toBe('2026-08-29T11:00');
  });

  it('understands tomorrow', () => {
    expect(detectAction('Remind me to call mum at 9am tomorrow', TODAY).dueAtLocal).toBe(
      '2026-08-30T09:00',
    );
  });

  it('takes a task from an explicit instruction', () => {
    const action = detectAction('Add task: fix the mobile navbar', TODAY);
    expect(action.type).toBe('CREATE_TASK');
    expect(action.title).toBe('fix the mobile navbar');
  });

  it('takes a word list', () => {
    const action = detectAction('add words: commute, errand and reliable', TODAY);
    expect(action.type).toBe('ADD_WORDS');
    expect(action.words).toEqual(['commute', 'errand', 'reliable']);
  });

  it('starts and ends a session', () => {
    expect(detectAction('start studying 45 minutes', TODAY).type).toBe('START_STUDY');
    expect(detectAction('start studying 45 minutes', TODAY).minutes).toBe(45);
    expect(detectAction('stop the session', TODAY).type).toBe('END_STUDY');
  });

  it('does nothing for ordinary conversation that happens to mention a time', () => {
    expect(detectAction('I woke up at 7 and went to work.', TODAY).type).toBe('NONE');
    expect(detectAction('My task yesterday was hard.', TODAY).type).toBe('NONE');
    expect(detectAction('Hello! How are you?', TODAY).type).toBe('NONE');
  });
});
