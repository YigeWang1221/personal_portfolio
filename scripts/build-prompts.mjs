// Prompt compiler for the AI assistant (ADR-022, SDD-AICHAT-001 §5.3). Pure function over content/ai/ and the public
// projection; scripts/build-ai.mjs writes the result to generated/ai/prompt-bundle.json.
//
// Checks (each failure names the file and line):
//   - front matter keys, role, locales, the block id named by prompt-order.yaml;
//   - one "## en" / "## zh" section per declared locale;
//   - variables: only the whitelist; {{sources}} and {{low_confidence}} only in the world-info block;
//   - per-block token budget (after build-time substitution);
//   - no fact value and no ledger claim ID in any prompt file: prompts say how to answer, never which facts;
//   - the post-history block keeps the [S…] citation reminder.
// With localOverrides (PROMPT_LOCAL_OVERRIDES=1) a file in prompts/local/ replaces the file of the same name, whole.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { estimateTokens } from '../shared/ai/tokenize.mjs';
import { RUNTIME_VARIABLES } from '../shared/ai/assemble.mjs';

const LOCALES = ['en', 'zh'];
const FRONT_MATTER_KEYS = new Set(['id', 'role', 'enabled', 'max_tokens', 'locales', 'name']);
const BUILD_VARIABLES = ['char_name', 'owner_name', 'owner_contact'];
const WORLD_INFO_ONLY = new Set(['sources', 'low_confidence']);
/** Looks like a ledger claim ID ("KK-04", "HPC-05"). Kept broad on purpose; exempt real strings explicitly. */
export const CLAIM_LIKE = /\b[A-Z][A-Z0-9]{0,5}-\d{2}\b/g;
/** Strings that look like claim IDs but are legitimate public text. Add entries here; never loosen the pattern. */
export const CLAIM_EXEMPT = [];
const CANNED_KEYS = ['personal', 'off_topic', 'insufficient', 'blocked', 'low_confidence', 'greeting'];

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

/** 1-based line of an offset in a text. */
function lineAt(text, offset) {
  return text.slice(0, offset).split('\n').length;
}

/**
 * Split a prompt file into front matter and per-locale bodies.
 * @returns {{meta: Record<string, unknown>, bodies: Record<string, {text: string, line: number}>, errors: string[]}}
 */
export function parsePromptFile(file, source) {
  const errors = [];
  const text = source.replace(/\r\n/g, '\n');
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) return { meta: {}, bodies: {}, errors: [`${file}:1: missing front matter (--- … ---)`] };
  let meta = {};
  try {
    meta = parseYaml(fm[1]) ?? {};
  } catch (e) {
    errors.push(`${file}:2: invalid front matter YAML: ${e.message}`);
  }
  for (const key of Object.keys(meta)) if (!FRONT_MATTER_KEYS.has(key)) errors.push(`${file}:2: unknown front matter key "${key}"`);
  const bodyStart = fm[0].length;
  const body = text.slice(bodyStart);
  const bodies = {};
  const heads = [...body.matchAll(/^## (\S+)\s*$/gm)];
  if (body.slice(0, heads[0]?.index ?? body.length).trim()) {
    errors.push(`${file}:${lineAt(text, bodyStart)}: text before the first "## <locale>" section`);
  }
  heads.forEach((h, i) => {
    const loc = h[1];
    const start = h.index + h[0].length;
    const end = heads[i + 1]?.index ?? body.length;
    const line = lineAt(text, bodyStart + h.index);
    if (!LOCALES.includes(loc)) errors.push(`${file}:${line}: unknown section "## ${loc}" (use ## en / ## zh)`);
    else if (bodies[loc]) errors.push(`${file}:${line}: duplicate section "## ${loc}"`);
    else {
      const raw = body.slice(start, end);
      bodies[loc] = { text: raw.trim(), line: line + 1, offset: bodyStart + start + (raw.length - raw.trimStart().length) };
    }
  });
  return { meta, bodies, errors };
}

function readSource(dir, name, localOverrides, overrides) {
  const local = join(dir, 'prompts', 'local', name);
  if (localOverrides && existsSync(local)) {
    overrides.push(name);
    return { file: `content/ai/prompts/local/${name}`, source: readFileSync(local, 'utf8') };
  }
  return { file: `content/ai/prompts/${name}`, source: readFileSync(join(dir, 'prompts', name), 'utf8') };
}

/** Fact values worth guarding: they contain a digit and are long enough not to collide with ordinary text. */
function guardedValues(projection) {
  const values = new Set();
  const add = (f) => {
    for (const loc of LOCALES) if (/\d/.test(f.value[loc]) && f.value[loc].length >= 4) values.add(f.value[loc]);
  };
  for (const p of projection.projects) p.facts.forEach(add);
  for (const h of projection.profile.highlights) add(h.fact);
  return [...values];
}

/** Report fact values and claim-like IDs in a raw source text, with line numbers. */
function leakErrors(file, source, values, exempt) {
  const errors = [];
  for (const m of source.matchAll(CLAIM_LIKE)) {
    if (!exempt.has(m[0])) errors.push(`${file}:${lineAt(source, m.index)}: looks like a ledger claim ID: ${m[0]}`);
  }
  for (const v of values) {
    let at = source.indexOf(v);
    while (at !== -1) {
      errors.push(`${file}:${lineAt(source, at)}: contains the fact value "${v}" (facts come only from the world book)`);
      at = source.indexOf(v, at + v.length);
    }
  }
  return errors;
}

function ownerContact(profile, locale) {
  const parts = [`${locale === 'zh' ? '邮箱' : 'email'} ${profile.email}`, ...profile.links.map((l) => `${l.label[locale]} ${l.url}`)];
  return parts.join(' · ');
}

function ownerProfileText(profile, locale) {
  const zh = locale === 'zh';
  return [
    zh ? `关于 ${profile.name.zh}：${profile.headline.zh}` : `About ${profile.name.en}: ${profile.headline.en}`,
    `${zh ? '教育' : 'Education'}: ${profile.education.map((e) => `${e.degree[locale]}, ${e.school[locale]} (${e.period[locale]})`).join('; ')}`,
    `${zh ? '经历' : 'Experience'}: ${profile.experience.map((e) => `${e.role[locale]}, ${e.org[locale]} (${e.period[locale]})`).join('; ')}`,
    `${zh ? '联系方式' : 'Contact'}: ${ownerContact(profile, locale)}`,
    zh ? '这是背景概览；具体细节请引用作品集资料。' : 'This is an orientation overview; cite details from the portfolio material.',
  ].join('\n');
}

/**
 * @param {{dir?: string, projection: object, localOverrides?: boolean, claimExempt?: string[]}} opts
 * @returns {{bundle: object | null, errors: string[], overrides: string[]}}
 */
export function buildPrompts({ dir = 'content/ai', projection, localOverrides = false, claimExempt = CLAIM_EXEMPT }) {
  const errors = [];
  const overrides = [];
  const exempt = new Set(claimExempt);
  const values = guardedValues(projection);

  // Order -------------------------------------------------------------------------------------------------
  const orderFile = 'content/ai/prompt-order.yaml';
  let order;
  try {
    order = parseYaml(readFileSync(join(dir, 'prompt-order.yaml'), 'utf8'));
  } catch (e) {
    return { bundle: null, errors: [`${orderFile}: ${e.message}`], overrides };
  }
  if (order?.version !== 1) errors.push(`${orderFile}: version must be 1`);
  if (!Array.isArray(order?.order)) return { bundle: null, errors: [...errors, `${orderFile}: "order" must be a list`], overrides };
  if (!(order.total_budget_tokens > 0)) errors.push(`${orderFile}: total_budget_tokens must be a positive number`);
  const slots = order.order.filter((i) => i.slot).map((i) => i.slot);
  if (slots.join(',') !== 'history,user-message') errors.push(`${orderFile}: needs exactly the slots "history" then "user-message"`);
  for (const step of order.drop_order ?? []) {
    if (step === 'main' || step === 'post-history') errors.push(`${orderFile}: "${step}" must never be dropped`);
  }

  // Canned replies and starters ---------------------------------------------------------------------------
  const cannedSrc = readSource(dir, '60-canned.yaml', localOverrides, overrides);
  const startersSrc = readSource(dir, '70-starters.yaml', localOverrides, overrides);
  let canned = {};
  let starters = {};
  try {
    canned = parseYaml(cannedSrc.source) ?? {};
  } catch (e) {
    errors.push(`${cannedSrc.file}: invalid YAML: ${e.message}`);
  }
  try {
    starters = parseYaml(startersSrc.source) ?? {};
  } catch (e) {
    errors.push(`${startersSrc.file}: invalid YAML: ${e.message}`);
  }
  errors.push(...leakErrors(cannedSrc.file, cannedSrc.source, values, exempt), ...leakErrors(startersSrc.file, startersSrc.source, values, exempt));
  for (const key of CANNED_KEYS) {
    for (const loc of LOCALES) if (typeof canned[key]?.[loc] !== 'string' || !canned[key][loc].trim()) errors.push(`${cannedSrc.file}: "${key}.${loc}" is missing`);
  }
  for (const key of Object.keys(canned)) if (!CANNED_KEYS.includes(key)) errors.push(`${cannedSrc.file}: unknown key "${key}"`);
  for (const loc of LOCALES) {
    const list = starters[loc];
    if (!Array.isArray(list) || list.length < 3 || list.length > 4 || list.some((s) => typeof s !== 'string' || !s.trim())) {
      errors.push(`${startersSrc.file}: "${loc}" needs three or four questions`);
    }
  }

  // Guard (content/ai/guard.yaml) ----------------------------------------------------------------------------
  const guardFile = 'content/ai/guard.yaml';
  let guard = null;
  try {
    const raw = readFileSync(join(dir, 'guard.yaml'), 'utf8');
    errors.push(...leakErrors(guardFile, raw, values, exempt));
    const g = parseYaml(raw) ?? {};
    if (g.version !== 1) errors.push(`${guardFile}: version must be 1`);
    const names = Array.isArray(g.owner_names) ? g.owner_names.filter((n) => typeof n === 'string' && n.trim()) : [];
    const ids = new Set();
    const rules = [];
    for (const [i, rule] of (Array.isArray(g.rules) ? g.rules : []).entries()) {
      const at = `${guardFile}: rule ${i + 1}${rule?.id ? ` (${rule.id})` : ''}`;
      if (!rule || typeof rule.id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(rule.id)) errors.push(`${at}: needs an id (lower-case, a-z0-9-)`);
      else if (ids.has(rule.id) || rule.id === 'unrelated') errors.push(`${at}: duplicate or reserved id`);
      else ids.add(rule.id);
      if (!CANNED_KEYS.includes(rule?.reply)) errors.push(`${at}: reply must be one of ${CANNED_KEYS.join(', ')}`);
      if (rule?.strike !== undefined && typeof rule.strike !== 'boolean') errors.push(`${at}: strike must be true or false`);
      if (!Array.isArray(rule?.patterns) || !rule.patterns.length) errors.push(`${at}: needs at least one pattern`);
      for (const p of rule?.patterns ?? []) {
        try {
          new RegExp(p, 'iu');
        } catch (e) {
          errors.push(`${at}: invalid pattern ${JSON.stringify(p)}: ${e.message}`);
        }
      }
      rules.push({ id: rule?.id, reply: rule?.reply, strike: Boolean(rule?.strike), patterns: rule?.patterns ?? [] });
    }
    if (!rules.length) errors.push(`${guardFile}: needs at least one rule`);
    // The owner's names from the profile always count, in both languages.
    const profileNames = [projection.profile.name.en, projection.profile.name.zh];
    guard = { owner_names: [...new Set([...profileNames, ...names])], rules };
  } catch (e) {
    errors.push(`${guardFile}: ${e.message}`);
  }

  // Blocks ------------------------------------------------------------------------------------------------
  const promptFiles = readdirSync(join(dir, 'prompts')).filter((f) => f.endsWith('.md')).sort();
  const parsed = new Map();
  for (const name of promptFiles) {
    const { file, source } = readSource(dir, name, localOverrides, overrides);
    const p = parsePromptFile(file, source);
    errors.push(...p.errors, ...leakErrors(file, source, values, exempt));
    if (typeof p.meta.id !== 'string') errors.push(`${file}:2: front matter needs "id"`);
    else if (parsed.has(p.meta.id)) errors.push(`${file}:2: duplicate block id "${p.meta.id}"`);
    else parsed.set(p.meta.id, { ...p, file, source });
  }

  const charNames = parsed.get('character')?.meta.name;
  const vars = {};
  for (const loc of LOCALES) {
    vars[loc] = {
      char_name: typeof charNames === 'object' ? charNames?.[loc] : charNames,
      owner_name: projection.profile.name[loc],
      owner_contact: ownerContact(projection.profile, loc),
    };
    if (!vars[loc].char_name) errors.push(`content/ai/prompts/10-character.md:2: front matter "name" needs "${loc}"`);
  }
  const fillBuild = (text, loc) =>
    text.replace(/\{\{([\w.]+)\}\}/g, (m, name) => {
      if (BUILD_VARIABLES.includes(name)) return vars[loc][name] ?? m;
      if (name.startsWith('canned.')) return canned[name.slice(7)]?.[loc] !== undefined ? fillBuild(canned[name.slice(7)][loc], loc) : m;
      return m;
    });
  const finalCanned = {};
  for (const key of CANNED_KEYS) {
    finalCanned[key] = {};
    for (const loc of LOCALES) {
      const raw = canned[key]?.[loc] ?? '';
      for (const m of raw.matchAll(/\{\{([\w.]+)\}\}/g)) {
        if (!['owner_name', 'owner_contact'].includes(m[1])) errors.push(`${cannedSrc.file}: "${key}.${loc}" uses {{${m[1]}}} (allowed: owner_name, owner_contact)`);
      }
      finalCanned[key][loc] = fillBuild(raw, loc);
    }
  }

  const blocks = {};
  const usedOrder = [];
  for (const item of order.order) {
    if (item.slot) {
      usedOrder.push({ slot: item.slot });
      continue;
    }
    const id = item.block;
    if (!['system', 'after-history'].includes(item.position)) errors.push(`${orderFile}: block "${id}" needs position system or after-history`);
    if (item.generated) {
      if (id !== 'owner-profile') errors.push(`${orderFile}: "${id}" is marked generated, but only owner-profile is generated`);
      blocks[id] = { role: 'system', droppable: Boolean(item.droppable), generated: true, text: { en: ownerProfileText(projection.profile, 'en'), zh: ownerProfileText(projection.profile, 'zh') } };
      usedOrder.push({ block: id, position: item.position });
      continue;
    }
    const p = parsed.get(id);
    if (!p) {
      errors.push(`${orderFile}: block "${id}" has no prompt file`);
      continue;
    }
    const { meta, bodies, file, source } = p;
    if (meta.enabled === false) {
      if (id === 'main' || id === 'post-history' || id === 'world-info') errors.push(`${file}:2: "${id}" cannot be disabled`);
      continue;
    }
    if (!['system', 'user', 'assistant'].includes(meta.role)) errors.push(`${file}:2: role must be system, user or assistant`);
    const locales = Array.isArray(meta.locales) ? meta.locales : [];
    if (!locales.length || locales.some((l) => !LOCALES.includes(l))) errors.push(`${file}:2: locales must be a list of en / zh`);
    for (const loc of locales) if (!bodies[loc]) errors.push(`${file}: missing "## ${loc}" section`);
    for (const loc of Object.keys(bodies)) if (!locales.includes(loc)) errors.push(`${file}:${bodies[loc].line - 1}: "## ${loc}" is not in locales`);
    const text = {};
    for (const loc of LOCALES) {
      const src = bodies[loc] ?? bodies[locales[0]];
      if (!src) continue;
      for (const m of src.text.matchAll(/\{\{([\w.]+)\}\}/g)) {
        const name = m[1];
        const line = lineAt(source, src.offset + m.index);
        const known = BUILD_VARIABLES.includes(name) || RUNTIME_VARIABLES.includes(name) || (name.startsWith('canned.') && CANNED_KEYS.includes(name.slice(7)));
        if (!known) errors.push(`${file}:${line}: unknown variable {{${name}}}`);
        else if (WORLD_INFO_ONLY.has(name) && id !== 'world-info') errors.push(`${file}:${line}: {{${name}}} is only allowed in the world-info block`);
      }
      text[loc] = fillBuild(src.text, loc);
      const budget = Number(meta.max_tokens);
      const tokens = estimateTokens(text[loc].replace(/\{\{\w+\}\}/g, ''));
      if (!(budget > 0)) errors.push(`${file}:2: max_tokens must be a positive number`);
      else if (tokens > budget) errors.push(`${file}:${src.line}: "## ${loc}" is about ${tokens} tokens, over max_tokens ${budget}`);
    }
    if (id === 'world-info' && !LOCALES.every((loc) => text[loc]?.includes('{{sources}}'))) errors.push(`${file}: the world-info block must contain {{sources}} in every language`);
    if (id === 'post-history' && !LOCALES.every((loc) => text[loc]?.includes('[S'))) errors.push(`${file}: the post-history block must keep the [S…] citation reminder in every language`);
    blocks[id] = { role: meta.role, droppable: Boolean(item.droppable), text };
    usedOrder.push({ block: id, position: item.position });
  }
  for (const required of ['main', 'world-info', 'post-history']) if (!blocks[required]) errors.push(`${orderFile}: required block "${required}" is missing or disabled`);
  for (const id of parsed.keys()) if (!order.order.some((i) => i.block === id)) errors.push(`content/ai/prompts: block "${id}" is not listed in prompt-order.yaml`);

  if (errors.length) return { bundle: null, errors, overrides };
  const body = {
    version: 1,
    totalBudgetTokens: order.total_budget_tokens,
    dropOrder: order.drop_order ?? [],
    order: usedOrder,
    blocks,
    canned: finalCanned,
    starters: { en: starters.en, zh: starters.zh },
    guard,
  };
  return { bundle: { ...body, hash: sha(JSON.stringify(body)), overrides: [...new Set(overrides)] }, errors, overrides };
}
