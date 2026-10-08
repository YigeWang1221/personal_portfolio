// T-SSE (SDD-AICHAT-001 §9): split UTF-8, CRLF, comments, oversized frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SseFrameTooLarge, createSseParser } from '../src/sse.mjs';

test('a UTF-8 character split across two chunks is decoded intact', () => {
  const p = createSseParser();
  const bytes = new TextEncoder().encode('data: {"t":"后端"}\n\n');
  const cut = bytes.indexOf(0xe5) + 1; // inside the first CJK character
  const out = [...p.push(bytes.slice(0, cut)), ...p.push(bytes.slice(cut))];
  assert.deepEqual(out, [{ event: 'message', data: '{"t":"后端"}' }]);
});

test('CRLF, CR and LF line ends; frames split across chunks; event names', () => {
  const p = createSseParser();
  const out = [...p.push('event: delta\r\ndata: a'), ...p.push('b\r\n\r'), ...p.push('\ndata: c\r\rdata: d\n\n')];
  assert.deepEqual(out, [{ event: 'delta', data: 'ab' }, { event: 'message', data: 'c' }, { event: 'message', data: 'd' }]);
});

test('comment lines (heartbeats, keep-alives) are reported separately and carry no data', () => {
  const p = createSseParser();
  assert.deepEqual(p.push(': keep-alive\n\ndata: x\n\n'), [{ comment: 'keep-alive' }, { event: 'message', data: 'x' }]);
});

test('a frame over the limit is rejected', () => {
  const p = createSseParser({ maxFrameBytes: 64 });
  assert.throws(() => p.push(`data: ${'x'.repeat(100)}\n`), SseFrameTooLarge);
  const q = createSseParser({ maxFrameBytes: 64 });
  assert.throws(() => q.push('x'.repeat(100)), SseFrameTooLarge, 'an unterminated line is limited too');
});
