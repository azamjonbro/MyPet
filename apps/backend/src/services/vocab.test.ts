import { describe, expect, it } from 'vitest';
import { findUsedWords } from './vocab.service.js';

const words = ['commute', 'postpone', 'to look forward to', 'reliable', 'study', 'plan'];

describe('spotting a learner using their own words', () => {
  it('finds a word used exactly as it was added', () => {
    expect(findUsedWords('My commute is long today.', words)).toEqual(['commute']);
  });

  it('credits the forms of the word people actually write', () => {
    expect(findUsedWords('We postponed the meeting.', words)).toEqual(['postpone']);
    expect(findUsedWords('She is postponing it again.', words)).toEqual(['postpone']);
    expect(findUsedWords('I have two commutes a day.', words)).toEqual(['commute']);
    expect(findUsedWords('I am planning a trip.', words)).toEqual(['plan']);
    expect(findUsedWords('I studied all evening.', words)).toEqual(['study']);
  });

  it('matches a phrase only as a phrase', () => {
    expect(findUsedWords('I look forward to Friday.', words)).toEqual(['to look forward to']);
    expect(findUsedWords('I look at the forward door.', words)).toEqual([]);
  });

  it('does not credit a word that merely starts the same way', () => {
    // "post" is not "postpone", and a learner would rightly complain if it were.
    expect(findUsedWords('I sent a post yesterday.', words)).toEqual([]);
    expect(findUsedWords('The computer is reliable enough', ['rely'])).toEqual([]);
  });

  it('ignores case and punctuation', () => {
    expect(findUsedWords('Reliable! Really — very Reliable.', words)).toEqual(['reliable']);
  });

  it('treats "to X" and "X" as the same word', () => {
    expect(findUsedWords('I postpone it.', ['to postpone'])).toEqual(['to postpone']);
  });

  it('returns every distinct word found, once each', () => {
    const found = findUsedWords('My commute is long, so I postponed my commute plan.', words);
    expect(found.sort()).toEqual(['commute', 'plan', 'postpone']);
  });

  it('is empty when the learner used none of them', () => {
    expect(findUsedWords('Hello, how are you?', words)).toEqual([]);
    expect(findUsedWords('anything at all', [])).toEqual([]);
  });
});
