// Shared tokenizer and retrieval (SDD-AICHAT-001 §5.2): the index and the query must agree.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileAliases, estimateTokens, stem, tokenize } from '../../shared/ai/tokenize.mjs';
import { buildIndex, questionLocale, search } from '../../shared/ai/retrieve.mjs';

test('English tokens are lower-cased, stemmed and stop words dropped', () => {
  assert.deepEqual(tokenize('The Projects were Deployed'), ['project', 'deploy']);
  assert.equal(stem('libraries'), 'library');
  assert.equal(stem('class'), 'class');
});

test('Chinese text becomes character bigrams', () => {
  assert.deepEqual(tokenize('后端项目'), ['后端', '端项', '项目']);
});

test('compound terms are indexed whole and by part', () => {
  const tokens = tokenize('Next.js and CI-CD');
  for (const t of ['next.js', 'next', 'js', 'ci-cd', 'ci', 'cd']) assert.ok(tokens.includes(t), t);
});

test('an alias group joins English and Chinese spellings', () => {
  const aliases = compileAliases([['backend', '后端']]);
  assert.ok(tokenize('后端开发', aliases).includes('~0'));
  assert.ok(tokenize('Backend work', aliases).includes('~0'));
  assert.ok(tokenize('two backends', aliases).includes('~0'), 'plural matches through stemming');
  assert.ok(!tokenize('backendless', aliases).includes('~0'), 'no partial-word match');
});

test('token estimate counts CJK characters one by one', () => {
  assert.equal(estimateTokens('后端'), 2);
  assert.equal(estimateTokens('abcd'), 1);
});

test('question language follows the characters used', () => {
  assert.equal(questionLocale('他做过哪些项目'), 'zh');
  assert.equal(questionLocale('Which projects?'), 'en');
  assert.equal(questionLocale('???', 'zh'), 'zh');
});

test('search keeps one language per section and prefers the question language', () => {
  const entry = (id, locale, text) => ({ id, scope: 'p', kind: 'project', locale, sectionId: 's', title: 'T', text, tags: [], sourcePath: '/', pagePath: '/', hash: id });
  const index = buildIndex({ aliases: [['backend', '后端']], pages: {}, entries: [entry('en', 'en', 'backend service'), entry('zh', 'zh', '后端服务')] });
  const zh = search(index, { question: '后端', threshold: 0 });
  assert.deepEqual(zh.hits.map((h) => h.entry.id), ['zh']);
  const en = search(index, { question: 'backend', threshold: 0 });
  assert.deepEqual(en.hits.map((h) => h.entry.id), ['en']);
});
