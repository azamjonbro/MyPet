/**
 * Extracts the `reply` string out of a JSON document as it streams in.
 *
 * Structured output means the model returns one JSON object, but the learner
 * should see words appear rather than a spinner followed by a wall of text.
 * Because `reply` is the first key in the schema, we can decode its contents
 * incrementally without waiting for — or fully parsing — the rest.
 *
 * Pure and synchronous, so it is unit-testable without a network call.
 */
export interface ReplyExtractor {
  push(chunk: string): string;
  readonly done: boolean;
}

const KEY_PATTERN = /"reply"\s*:\s*"$/;
const SEEK_WINDOW = 64;

export function createReplyExtractor(): ReplyExtractor {
  let phase: 'seek' | 'read' | 'done' = 'seek';
  let seekBuf = '';
  let escaped = false;
  let unicode = '';

  return {
    push(chunk: string): string {
      let out = '';
      for (const ch of chunk) {
        if (phase === 'done') break;

        if (phase === 'seek') {
          seekBuf += ch;
          if (seekBuf.length > SEEK_WINDOW) seekBuf = seekBuf.slice(-SEEK_WINDOW);
          if (KEY_PATTERN.test(seekBuf)) {
            phase = 'read';
            seekBuf = '';
          }
          continue;
        }

        // Mid \uXXXX escape.
        if (unicode) {
          unicode += ch;
          if (unicode.length === 5) {
            out += String.fromCharCode(Number.parseInt(unicode.slice(1), 16));
            unicode = '';
          }
          continue;
        }

        if (escaped) {
          escaped = false;
          if (ch === 'n') out += '\n';
          else if (ch === 't') out += '\t';
          else if (ch === 'r') out += '\r';
          else if (ch === 'b') out += '\b';
          else if (ch === 'f') out += '\f';
          else if (ch === 'u') unicode = 'u';
          else out += ch; // " \ /
          continue;
        }

        if (ch === '\\') {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          phase = 'done';
          break;
        }
        out += ch;
      }
      return out;
    },
    get done() {
      return phase === 'done';
    },
  };
}
