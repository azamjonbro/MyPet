import { describe, expect, it } from 'vitest';
import { estimateTokens, MAX_PROMPT_TOKENS, WORKING_MEMORY_TURNS } from './memory.service.js';
import { buildSystemPrompt } from '../ai/prompts/system.js';

describe('prompt assembly', () => {
  const base = {
    level: 'A1' as const,
    targetLevel: 'B2' as const,
    targetExam: 'IELTS',
    currentDay: 17,
    weakTopics: [],
    recentMistakes: [],
    summary: null,
    displayName: 'Aziz',
  };

  it('tells an A1 learner a much tighter sentence limit than a B2 one', () => {
    const a1 = buildSystemPrompt(base);
    const b2 = buildSystemPrompt({ ...base, level: 'B2' });
    expect(a1).toContain('under 12 words');
    expect(b2).toContain('under 26 words');
    expect(a1).toContain('No idioms');
    expect(b2).not.toContain('No idioms');
  });

  it('includes the plan day so the tutor knows where the learner is', () => {
    expect(buildSystemPrompt(base)).toContain('Day 17 of a 90-day plan');
    expect(buildSystemPrompt({ ...base, currentDay: 0 })).toContain('not started the 90-day plan');
  });

  it('injects weak topics as readable labels, not raw ids', () => {
    const prompt = buildSystemPrompt({ ...base, weakTopics: ['PAST_SIMPLE_IRREGULAR', 'ARTICLES'] });
    expect(prompt).toContain('Past Simple · irregular verbs');
    expect(prompt).toContain('Articles (a / an / the)');
    expect(prompt).not.toContain('PAST_SIMPLE_IRREGULAR');
  });

  it('omits the weakness section entirely for a learner with no record', () => {
    expect(buildSystemPrompt(base)).not.toContain('keeps getting wrong');
  });

  it('tells the model not to duplicate the correction formatting', () => {
    expect(buildSystemPrompt(base)).toContain('the app renders it');
  });

  it('stays well inside the tier-0 budget even when fully populated', () => {
    const prompt = buildSystemPrompt({
      ...base,
      weakTopics: ['PAST_SIMPLE_IRREGULAR', 'ARTICLES', 'QUANTIFIERS'],
      recentMistakes: [
        { original: 'I goed', corrected: 'I went', topicId: 'PAST_SIMPLE_IRREGULAR' },
        { original: 'much books', corrected: 'many books', topicId: 'QUANTIFIERS' },
        { original: 'a apple', corrected: 'an apple', topicId: 'ARTICLES' },
      ],
      summary: 'The learner talked about their job and struggled with past tenses.',
    });
    expect(estimateTokens(prompt)).toBeLessThan(MAX_PROMPT_TOKENS / 2);
  });

  it('keeps a working window small enough to stay attentive', () => {
    expect(WORKING_MEMORY_TURNS).toBeLessThanOrEqual(10);
  });
});
