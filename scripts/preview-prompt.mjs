// Prompt preview (SDD-AICHAT-001 §5.3.6): prints the retrieval hits and the fully assembled prompt for one question,
// exactly as the backend would build it. Calls no model.
// Usage: npm run chat:preview -- --q "他做过哪些后端项目" [--locale zh] [--page /zh/projects/kk-knock/]
//                                [--history turns.json] [--generated generated] [--full]
//                                [--provider mock | --provider A|B|C --live]
// --provider mock: also stream an answer from the mock provider (no network).
// --provider A|B|C --live: one REAL call to that provider with the keys in the environment (costs money; ask the
//   owner first, AGENTS.md "AI chat work"). Without --live, a real provider is refused.
// --history: a JSON file with [{ "role": "user" | "assistant", "text": "…" }, …] (completed turns, oldest first).
// --full: print the whole system text instead of the first lines of each block.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assemblePrompt } from '../shared/ai/assemble.mjs';
import { buildIndex, search, selectSources } from '../shared/ai/retrieve.mjs';
import { compileGuard, guardRequest } from '../shared/ai/guard.mjs';
import { createProviderState, generate } from '../backend/src/chat.mjs';
import { loadConfig } from '../backend/src/config.mjs';
import { buildProviders } from '../backend/src/server.mjs';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i > -1 ? args[i + 1] : fallback;
};
const question = arg('--q');
if (!question) {
  console.error('Usage: npm run chat:preview -- --q "question" [--locale en|zh] [--page /path/] [--history turns.json] [--full]');
  process.exit(1);
}
const generated = arg('--generated', 'generated');
const ai = join(generated, 'ai');
if (!existsSync(join(ai, 'prompt-bundle.json'))) {
  console.error(`${ai}/ is missing; run npm run build first`);
  process.exit(1);
}
const worldbook = JSON.parse(readFileSync(join(ai, 'worldbook.json'), 'utf8'));
const bundle = JSON.parse(readFileSync(join(ai, 'prompt-bundle.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(join(ai, 'manifest.json'), 'utf8'));
const pagePath = arg('--page');
const history = arg('--history') ? JSON.parse(readFileSync(arg('--history'), 'utf8')) : [];
const index = buildIndex(worldbook);
const previous = [...history].reverse().find((t) => t.role === 'user')?.text;
const result = search(index, { question, previous, pagePath, locale: arg('--locale', 'en') });
const decision = guardRequest(compileGuard(bundle.guard), {
  message: question,
  history,
  result,
  previousResult: previous ? search(index, { question: previous }) : undefined,
});
if (decision.action === 'refuse') {
  console.log(`guard: REFUSED (${decision.id}${decision.strike ? ', counts as misuse' : ''}) — no model would be called.`);
  console.log(`reply: ${bundle.canned[decision.reply][result.locale]}`);
  process.exit(0);
}
console.log('guard: passed');
const hits = selectSources(index, result);
const sources = hits.map((e, i) => ({ tag: `S${i + 1}`, title: e.title, path: e.sourcePath, text: e.text }));
const prompt = assemblePrompt(bundle, {
  locale: result.locale,
  message: question,
  history,
  sources,
  pageTitle: pagePath ? worldbook.pages[pagePath]?.title : undefined,
  lowConfidence: !result.confident,
});

const line = (s = '') => console.log(s);
line(`knowledge ${manifest.knowledgeVersion} · prompts ${manifest.promptHash}${manifest.dirty ? ' · dirty' : ''}${manifest.overrides.length ? ` · overrides: ${manifest.overrides.join(', ')}` : ''}`);
line(`question locale: ${result.locale} · top score ${result.topScore.toFixed(2)} · coverage ${result.coverage.toFixed(2)}${result.named.length ? ` · names ${result.named.join(', ')}` : ''} · ${result.confident ? 'confident' : 'below threshold → profile overview + best hits, low-confidence note'}`);
line();
line('Retrieval');
for (const [i, h] of result.hits.entries()) line(`  ${result.confident ? `S${i + 1}` : '  '}  ${h.score.toFixed(2).padStart(6)}  ${h.entry.id}  ${h.entry.sourcePath}`);
if (!result.confident) for (const [i, e] of hits.entries()) line(`  S${i + 1}  sent      ${e.id}`);
line();
line(`Blocks (≈ tokens; total ≈ ${prompt.totalTokens} of ${bundle.totalBudgetTokens})${prompt.dropped.length ? ` · dropped: ${prompt.dropped.join(', ')}` : ''}`);
for (const b of prompt.blocks) line(`  ${b.id.padEnd(14)} ${String(b.tokens).padStart(5)}`);
line();
line('=== system ===');
if (args.includes('--full')) line(prompt.system);
else for (const part of prompt.system.split('\n\n---\n\n')) line(`${part.split('\n').slice(0, 4).join('\n')}\n  …\n`);
for (const m of prompt.messages) {
  line(`=== ${m.role} ===`);
  line(m.text);
}

const providerArg = arg('--provider');
if (providerArg) {
  const live = args.includes('--live');
  const id = providerArg.toUpperCase();
  if (id !== 'MOCK' && !live) {
    console.error(`\n--provider ${providerArg} makes a real, billed call: add --live to confirm.`);
    process.exit(1);
  }
  const config = loadConfig(id === 'MOCK' ? { ...process.env, PROVIDER_MODE: 'mock', PROVIDER_ORDER: 'A' } : { ...process.env, PROVIDER_ORDER: id });
  const providers = buildProviders(config);
  if (!providers.length) {
    console.error(`\nProvider ${id} is not configured (URL, key and model are needed; see backend/.env.example).`);
    process.exit(1);
  }
  line();
  line(`=== ${id === 'MOCK' ? 'mock' : `LIVE provider ${id}`} answer ===`);
  const writer = {
    event(name, payload) {
      if (name === 'delta') process.stdout.write(payload.text);
      else line(`\n[${name}] ${JSON.stringify(payload)}`);
      return true;
    },
    comment: () => true,
  };
  const outcome = await generate({ prompt, providers, state: createProviderState(), timing: config.timing, writer, clientSignal: new AbortController().signal, cannedBlocked: bundle.canned.blocked[result.locale] });
  line(`\n[outcome] ${outcome.outcome} · provider ${outcome.provider ?? '—'} · first text ${outcome.firstTextMs ?? '—'} ms`);
}

