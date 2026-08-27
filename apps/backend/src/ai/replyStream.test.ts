import { describe, expect, it } from 'vitest';
import { createReplyExtractor } from './replyStream.js';

function feed(chunks: string[]): string {
  const ex = createReplyExtractor();
  return chunks.map((c) => ex.push(c)).join('');
}

describe('streaming reply extractor', () => {
  it('reads the reply out of a complete document', () => {
    expect(feed(['{"reply":"Nice sentence!","corrections":[]}'])).toBe('Nice sentence!');
  });

  it('survives the key being split across chunks', () => {
    expect(feed(['{"re', 'ply"', ':', '"Hel', 'lo"', ',"corrections":[]}'])).toBe('Hello');
  });

  it('stops at the closing quote and ignores the rest of the document', () => {
    const out = feed(['{"reply":"Done","corrections":[{"original":"goed"}]}']);
    expect(out).toBe('Done');
  });

  it('decodes escapes rather than leaking them to the learner', () => {
    expect(feed(['{"reply":"Line one\\nLine \\"two\\"","x":1}'])).toBe('Line one\nLine "two"');
  });

  it('decodes a unicode escape split across chunk boundaries', () => {
    expect(feed(['{"reply":"caf\\u00', 'e9 time"}'])).toBe('café time');
  });

  it('tolerates whitespace the model may emit around the colon', () => {
    expect(feed(['{ "reply" :  "Hi" }'])).toBe('Hi');
  });

  it('never mistakes a later field named reply-ish for the real one', () => {
    // The extractor locks on at the first match and is done after it.
    const ex = createReplyExtractor();
    ex.push('{"reply":"first"');
    expect(ex.done).toBe(true);
    expect(ex.push(',"notreply":"second"}')).toBe('');
  });

  it('reports done only once the string is closed', () => {
    const ex = createReplyExtractor();
    ex.push('{"reply":"still going');
    expect(ex.done).toBe(false);
    ex.push('"}');
    expect(ex.done).toBe(true);
  });
});
