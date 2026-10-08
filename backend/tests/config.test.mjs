// Model plans (owner decision 2026-10-08): the owner chooses every model; each plan is API_URL / MODEL / KEY.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig, resolveEndpoint } from '../src/config.mjs';

test('no plan, no model: an empty environment enables nothing and names no model', () => {
  const c = loadConfig({});
  assert.deepEqual(c.order, ['A', 'B', 'C']);
  for (const id of ['A', 'B', 'C']) {
    assert.equal(c.providers[id].enabled, false);
    assert.equal(c.providers[id].model, '');
    assert.equal(c.providers[id].url, '');
  }
});

test('a plan needs all three values', () => {
  const c = loadConfig({ API_URL_PLAN_A: 'https://api.example.com/v1', MODEL_PLAN_A: 'm', KEY_PLAN_A: 'k', API_URL_PLAN_B: 'https://b.example', MODEL_PLAN_B: 'm2' });
  assert.equal(c.providers.A.enabled, true);
  assert.equal(c.providers.B.enabled, false, 'no key');
  assert.equal(c.providers.C.enabled, false);
});

test('the protocol follows the URL', () => {
  assert.deepEqual(resolveEndpoint('https://api.example.com'), { kind: 'openai', url: 'https://api.example.com/chat/completions' });
  assert.deepEqual(resolveEndpoint('http://gateway:8080/v1/'), { kind: 'openai', url: 'http://gateway:8080/v1/chat/completions' });
  assert.deepEqual(resolveEndpoint('https://x.example/v1/chat/completions'), { kind: 'openai', url: 'https://x.example/v1/chat/completions' });
  assert.deepEqual(resolveEndpoint('https://generativelanguage.googleapis.com/v1beta'), { kind: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta' });
  assert.deepEqual(resolveEndpoint('https://generativelanguage.googleapis.com/v1beta/models/some-model:streamGenerateContent?alt=sse'), { kind: 'gemini', url: 'https://generativelanguage.googleapis.com/v1beta' });
  assert.equal(resolveEndpoint('https://generativelanguage.googleapis.com/v1beta/openai/').kind, 'openai', "Google's OpenAI-compatible endpoint");
  assert.equal(resolveEndpoint('not a url'), null);
  assert.equal(resolveEndpoint('ftp://x.example'), null);
  assert.equal(resolveEndpoint('https://user:secret@x.example/v1'), null, 'credentials never in the URL');
});

test('PROVIDER_ORDER chooses and orders plans; unknown or repeated ids are ignored', () => {
  const env = { PROVIDER_ORDER: 'c, a, x, a' };
  for (const id of ['A', 'C']) Object.assign(env, { [`API_URL_PLAN_${id}`]: 'https://x.example', [`MODEL_PLAN_${id}`]: 'm', [`KEY_PLAN_${id}`]: 'k' });
  const c = loadConfig(env);
  assert.deepEqual(c.order, ['C', 'A']);
  assert.equal(c.providers.B.enabled, false);
});
