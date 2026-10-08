// T-FB-01 … T-FB-05 (SDD-AICHAT-001 §9) and the rest of the switching table (§5.6), with mock providers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProviderState, generate } from '../src/chat.mjs';
import { mockProvider } from '../src/providers/mock.mjs';
import { FAST, collectWriter } from './helpers.mjs';

const PROMPT = { system: 's', messages: [{ role: 'user', text: 'q' }] };
const ok = (text = 'answer [S1]') => [{ delay: 5, text }, { finish: 'stop', usage: { in: 1, out: 1 } }];
const fail = (status, kind = 'http') => [{ delay: 5, error: { kind, status } }];

function run(providers, { state = createProviderState(), timing = FAST, signal = new AbortController().signal } = {}) {
  const writer = collectWriter();
  return generate({ prompt: PROMPT, providers, state, timing, writer, clientSignal: signal, cannedBlocked: 'BLOCKED-REPLY' }).then((r) => ({ ...r, writer, state }));
}

test('T-FB-01: A succeeds, only A is called', async () => {
  const [a, b, c] = [mockProvider('A', ok()), mockProvider('B', ok()), mockProvider('C', ok())];
  const r = await run([a, b, c]);
  assert.equal(r.outcome, 'done');
  assert.equal(r.provider, 'A');
  assert.deepEqual([a.calls.length, b.calls.length, c.calls.length], [1, 0, 0]);
  assert.ok(!r.writer.names().includes('status'));
});

test('T-FB-02: A times out before any text, B answers after the first-text timeout', async () => {
  const a = mockProvider('A', [{ hang: true }]);
  const b = mockProvider('B', ok('from B'));
  const t0 = Date.now();
  const r = await run([a, b]);
  assert.equal(r.provider, 'B');
  assert.equal(r.writer.text(), 'from B');
  assert.ok(Date.now() - t0 >= FAST.firstTextMs, 'waited for the first-text timeout');
  assert.deepEqual(r.writer.names().slice(0, 1), ['status']);
  assert.deepEqual(r.writer.events[0].payload, { stage: 'switching' });
});

test('T-FB-03: A and B fail, C answers; all three fail → UNAVAILABLE within the total budget', async () => {
  const r1 = await run([mockProvider('A', fail(503)), mockProvider('B', fail(0, 'network')), mockProvider('C', ok('from C'))]);
  assert.equal(r1.provider, 'C');
  assert.equal(r1.attempts, 3);
  const t0 = Date.now();
  const r2 = await run([mockProvider('A', [{ hang: true }]), mockProvider('B', [{ hang: true }]), mockProvider('C', [{ hang: true }])]);
  assert.equal(r2.outcome, 'unavailable');
  assert.deepEqual(r2.writer.events.at(-1), { name: 'error', payload: { code: 'UNAVAILABLE', partial: false } });
  assert.ok(Date.now() - t0 <= FAST.totalMs + 100, 'total budget respected');
});

test('T-FB-04: A fails after its first text → partial error, B and C never called', async () => {
  const a = mockProvider('A', [{ delay: 5, text: 'half an ans' }, { delay: 5, error: { kind: 'network' } }]);
  const [b, c] = [mockProvider('B', ok()), mockProvider('C', ok())];
  const r = await run([a, b, c]);
  assert.equal(r.outcome, 'interrupted');
  assert.equal(r.partial, true);
  assert.deepEqual(r.writer.events.at(-1), { name: 'error', payload: { code: 'UPSTREAM_INTERRUPTED', partial: true } });
  assert.deepEqual([b.calls.length, c.calls.length], [0, 0]);
});

test('T-FB-04: an idle gap after text ends the answer as partial', async () => {
  const a = mockProvider('A', [{ delay: 5, text: 'start' }, { hang: true }]);
  const b = mockProvider('B', ok());
  const r = await run([a, b]);
  assert.equal(r.outcome, 'interrupted');
  assert.equal(b.calls.length, 0);
});

test('T-FB-05: 400 stops without trying others; blocked returns the fixed refusal; 401 disables A', async () => {
  const b1 = mockProvider('B', ok());
  const r400 = await run([mockProvider('A', fail(400)), b1]);
  assert.equal(r400.outcome, 'bad_request');
  assert.equal(b1.calls.length, 0);

  const b2 = mockProvider('B', ok());
  const rBlocked = await run([mockProvider('A', [{ delay: 5, finish: 'blocked' }]), b2]);
  assert.equal(rBlocked.outcome, 'blocked');
  assert.equal(rBlocked.writer.text(), 'BLOCKED-REPLY');
  assert.deepEqual(rBlocked.writer.events.at(-1), { name: 'done', payload: { finishReason: 'blocked' } });
  assert.equal(b2.calls.length, 0, 'blocked does not switch');

  const state = createProviderState();
  const a = mockProvider('A', fail(401));
  const r401 = await run([a, mockProvider('B', ok('from B'))], { state });
  assert.equal(r401.provider, 'B');
  assert.deepEqual(state.snapshot().disabled, ['A']);
  await run([a, mockProvider('B', ok())], { state });
  assert.equal(a.calls.length, 1, 'a disabled provider is skipped on the next request');
});

test('429 cools a provider down; 402 (no balance) disables it', async () => {
  let t = 0;
  const state = createProviderState(() => t);
  const a = mockProvider('A', fail(429));
  await run([a, mockProvider('B', ok())], { state });
  assert.deepEqual(state.snapshot().cooling, ['A']);
  await run([a, mockProvider('B', ok())], { state });
  assert.equal(a.calls.length, 1, 'skipped while cooling');
  t += FAST.cooldownMs + 1;
  await run([a, mockProvider('B', ok())], { state });
  assert.equal(a.calls.length, 2, 'tried again after the cool-down');

  const s2 = createProviderState();
  await run([mockProvider('B', fail(402)), mockProvider('C', ok())], { state: s2 });
  assert.deepEqual(s2.snapshot().disabled, ['B']);
});

test('finish=length after text is a partial OUTPUT_LIMIT; an empty answer moves to the next provider', async () => {
  const r = await run([mockProvider('A', [{ delay: 5, text: 'long' }, { finish: 'length' }])]);
  assert.deepEqual(r.writer.events.at(-1), { name: 'error', payload: { code: 'OUTPUT_LIMIT', partial: true } });
  const r2 = await run([mockProvider('A', [{ delay: 5, finish: 'stop' }]), mockProvider('B', ok('from B'))]);
  assert.equal(r2.provider, 'B');
});

test('provider keep-alives do not extend the first-text timeout', async () => {
  const keepalives = Array.from({ length: 20 }, () => ({ delay: 20, keepalive: true }));
  const r = await run([mockProvider('A', [...keepalives, { text: 'too late' }, { finish: 'stop' }]), mockProvider('B', ok('from B'))]);
  assert.equal(r.provider, 'B');
});

test('T-CANCEL: a visitor cancel stops the provider and does not switch', async () => {
  const ac = new AbortController();
  let aborted = false;
  const a = { id: 'A', calls: [], async *stream(prompt, signal) {
    signal.addEventListener('abort', () => (aborted = true));
    yield { type: 'text', text: 'partial' };
    await new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
  } };
  const b = mockProvider('B', ok());
  setTimeout(() => ac.abort('client'), 30);
  const r = await run([a, b], { signal: ac.signal });
  assert.equal(r.outcome, 'cancelled');
  assert.equal(aborted, true, 'the upstream request was aborted');
  assert.equal(b.calls.length, 0);
});
