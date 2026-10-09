// World book for the AI assistant (ADR-022, SDD-AICHAT-001 §5.2 "切块与索引"). Pure function over the public
// projection (generated/raw/projection.json); scripts/build-ai.mjs writes the result.
//
// One entry per section; a section longer than ~600 tokens is split at paragraph breaks. Every chunk that shows a
// fact value also lists that fact with its condition, so a number never travels without its conditions.
import { createHash } from 'node:crypto';
import { estimateTokens } from '../shared/ai/tokenize.mjs';

const CHUNK_TOKENS = 600;
/** Section id of the generated project overview. "@" cannot occur in a narrative section id, so it never collides. */
export const OVERVIEW = '@overview';

const L = {
  en: {
    project: 'Project',
    summary: 'Summary',
    status: 'Status',
    team: 'Team',
    role: "Yige's responsibility (state it as written)",
    context: 'Context',
    period: 'Period',
    // Not "Technologies": that word is a retrieval alias for skills and would match every project overview.
    stack: 'Built with',
    capabilities: 'Capabilities',
    links: 'Links',
    card: 'Introduction',
    highlight: 'Engineering highlight',
    facts: 'Facts (always give the condition with the value)',
    sectionFacts: 'Facts shown in this section',
    condition: 'condition',
    overview: 'Overview',
    profile: 'Profile',
    headline: 'Headline',
    contact: 'Contact',
    email: 'Email',
    education: 'Education',
    experience: 'Internships and work experience (stated as on the résumé)',
    skills: 'Skills and the projects that show them',
    highlights: 'Résumé highlights',
    catalog: 'All projects on this site',
    background: 'Background',
    plan: 'How I plan & design',
    shownIn: 'shown in',
    also: 'also',
  },
  zh: {
    project: '项目',
    summary: '概述',
    status: '状态',
    team: '团队',
    role: 'Yige 的职责（按原文表述）',
    context: '领域',
    period: '时间',
    stack: '技术',
    capabilities: '能力方向',
    links: '链接',
    card: '简介',
    highlight: '工程亮点',
    facts: '事实（提到数值时必须同时说明条件）',
    sectionFacts: '本节出现的事实',
    condition: '条件',
    overview: '概览',
    profile: '个人资料',
    headline: '定位',
    contact: '联系方式',
    email: '邮箱',
    education: '教育背景',
    experience: '实习与工作经历（与简历表述一致）',
    skills: '技能及体现它们的项目',
    highlights: '简历亮点',
    catalog: '本站全部项目',
    background: '背景',
    plan: '我如何规划与设计',
    shownIn: '见',
    also: '另含',
  },
};

const hash = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function factLine(f, locale) {
  return `- ${f.label[locale]}: ${f.value[locale]} (${L[locale].condition}: ${f.condition[locale]})`;
}

/** Split text at paragraph breaks into chunks of at most CHUNK_TOKENS (a single long paragraph stays whole). */
export function chunkText(text, limit = CHUNK_TOKENS) {
  if (estimateTokens(text) <= limit) return [text];
  const chunks = [];
  let current = '';
  for (const para of text.split(/\n{2,}/)) {
    const next = current ? `${current}\n\n${para}` : para;
    if (current && estimateTokens(next) > limit) {
      chunks.push(current);
      current = para;
    } else current = next;
  }
  if (current) chunks.push(current);
  return chunks;
}

function makeEntry({ scope, kind, locale, sectionId, title, text, tags, sourcePath, pagePath }, n) {
  const id = `${scope}:${locale}:${sectionId}${n ? `:${n}` : ''}`;
  return { id, scope, kind, locale, sectionId, title, text, tags, sourcePath, pagePath, hash: hash(`${title}\n${text}`) };
}

function sectionEntries({ scope, kind, locale, prefix, sections, facts = [], tags, pagePath }) {
  const out = [];
  for (const s of sections) {
    const chunks = chunkText(s.text);
    chunks.forEach((chunk, i) => {
      const shown = facts.filter((f) => s.facts.includes(f.key) && chunk.includes(f.value[locale]));
      const text = shown.length ? `${chunk}\n\n${L[locale].sectionFacts}:\n${shown.map((f) => factLine(f, locale)).join('\n')}` : chunk;
      out.push(makeEntry({ scope, kind, locale, sectionId: s.id, title: `${prefix} · ${s.title}`, text, tags: [...tags, s.id], sourcePath: s.path, pagePath }, chunks.length > 1 ? i + 1 : 0));
    });
  }
  return out;
}

function focusTitle(projection, id, locale) {
  return projection.focus.find((f) => f.id === id)?.title[locale] ?? id;
}

function projectOverview(p, projection, locale) {
  const t = L[locale];
  const lines = [
    `${t.project}: ${p.title[locale]} — ${p.subtitle[locale]}`,
    `${t.summary}: ${p.summary[locale]}`,
    `${t.status}: ${p.status[locale]}${p.statusNote ? ` — ${p.statusNote[locale]}` : ''}`,
    `${t.team}: ${p.team[locale]}`,
    `${t.role}: ${p.role[locale]}`,
    `${t.context}: ${p.context[locale]} · ${t.period}: ${p.period[locale]}`,
    `${t.stack}: ${p.stack.join(', ')}`,
    `${t.capabilities}: ${[p.focus.primary, ...p.focus.also].map((id) => focusTitle(projection, id, locale)).join(', ')}`,
  ];
  if (p.card) {
    lines.push(`${t.card}: ${p.card.intro[locale]}`);
    if (p.card.highlight) lines.push(`${t.highlight}: ${p.card.highlight[locale]}`);
  }
  if (p.links.length) lines.push(`${t.links}: ${p.links.map((l) => `${l.label[locale]} ${l.url}`).join(' · ')}`);
  if (p.facts.length) lines.push(`${t.facts}:\n${p.facts.map((f) => factLine(f, locale)).join('\n')}`);
  return lines.join('\n');
}

function profileEntries(projection, locale) {
  const t = L[locale];
  const pr = projection.profile;
  const titles = new Map(projection.projects.map((p) => [p.slug, p.title[locale]]));
  const base = { scope: 'profile', kind: 'profile', locale, pagePath: pr.path[locale] };
  const tags = ['profile', 'resume'];
  const contact = `${t.email}: ${pr.email}${pr.links.map((l) => ` · ${l.label[locale]}: ${l.url}`).join('')}`;
  return [
    makeEntry({ ...base, sectionId: 'overview', title: `${t.profile} · ${pr.name[locale]}`, tags: [...tags, 'contact'], sourcePath: pr.path[locale],
      text: [`${pr.name[locale]} — ${pr.headline[locale]}`, `${t.contact}: ${contact}`,
        `${t.education}: ${pr.education.map((e) => `${e.degree[locale]}, ${e.school[locale]} (${e.period[locale]})`).join('; ')}`,
        `${t.experience}: ${pr.experience.map((e) => `${e.role[locale]}, ${e.org[locale]} (${e.period[locale]})`).join('; ')}`].join('\n') }),
    makeEntry({ ...base, sectionId: 'education', title: `${t.profile} · ${t.education}`, tags: [...tags, 'education'], sourcePath: `${pr.path[locale]}#education`,
      text: pr.education.map((e) => [`${e.degree[locale]} — ${e.school[locale]}, ${e.location[locale]} (${e.period[locale]})`, ...e.details.map((d) => `- ${d[locale]}`)].join('\n')).join('\n\n') }),
    makeEntry({ ...base, sectionId: 'experience', title: `${t.profile} · ${t.experience}`, tags: [...tags, 'experience', 'internship'], sourcePath: `${pr.path[locale]}#experience`,
      text: pr.experience.map((e) => [`${e.role[locale]} — ${e.org[locale]}, ${e.location[locale]} (${e.period[locale]})`, ...e.bullets.map((b) => `- ${b[locale]}`)].join('\n')).join('\n\n') }),
    makeEntry({ ...base, sectionId: 'skills', title: `${t.profile} · ${t.skills}`, tags: [...tags, 'skills'], sourcePath: `${pr.path[locale]}#skills`,
      text: pr.skills.map((g) => `${g.group[locale]}: ${g.items.map((i) => `${i.name[locale]} (${t.shownIn} ${i.evidence.map((s) => titles.get(s)).filter(Boolean).join(', ')})`).join('; ')}`).join('\n') }),
    makeEntry({ ...base, sectionId: 'highlights', title: `${t.profile} · ${t.highlights}`, tags: [...tags, 'highlights'], sourcePath: `${pr.path[locale]}#highlights`,
      text: pr.highlights.map((h) => `${titles.get(h.project)}: ${factLine(h.fact, locale).slice(2)}`).join('\n') }),
  ];
}

function catalogEntry(projection, locale) {
  const t = L[locale];
  const path = locale === 'zh' ? '/zh/projects/' : '/projects/';
  const text = projection.projects
    .map((p) => `- ${p.title[locale]}: ${p.subtitle[locale]} · ${p.status[locale]} · ${p.team[locale]} · ${t.capabilities}: ${[p.focus.primary, ...p.focus.also].map((id) => focusTitle(projection, id, locale)).join(', ')} · ${p.path[locale]}`)
    .join('\n');
  return makeEntry({ scope: 'catalog', kind: 'catalog', locale, sectionId: 'index', title: t.catalog, text, tags: ['catalog', 'projects'], sourcePath: path, pagePath: path });
}

/**
 * @param {object} projection generated/raw/projection.json
 * @param {string[][]} aliasGroups content/ai/aliases.yaml "groups"
 */
export function buildWorldbook(projection, aliasGroups = []) {
  const entries = [];
  const pages = {};
  for (const locale of projection.locales) {
    const t = L[locale];
    for (const p of projection.projects) {
      const tags = ['project', p.slug, p.focus.primary, ...p.focus.also];
      pages[p.path[locale]] = { scope: p.slug, title: p.title[locale] };
      entries.push(makeEntry({ scope: p.slug, kind: 'project', locale, sectionId: OVERVIEW, title: `${p.title[locale]} · ${t.overview}`,
        text: projectOverview(p, projection, locale), tags: [...tags, 'overview'], sourcePath: p.path[locale], pagePath: p.path[locale] }));
      entries.push(...sectionEntries({ scope: p.slug, kind: 'project', locale, prefix: p.title[locale], sections: p.sections[locale], facts: p.facts, tags, pagePath: p.path[locale] }));
    }
    entries.push(...profileEntries(projection, locale));
    pages[projection.profile.path[locale]] = { scope: 'profile', title: t.profile };
    entries.push(catalogEntry(projection, locale));
    pages[locale === 'zh' ? '/zh/projects/' : '/projects/'] = { scope: 'catalog', title: t.catalog };
    for (const [key, title] of [['background', t.background], ['plan', t.plan]]) {
      const page = projection.pages[key];
      // Page narratives cite facts of any project; a fact is listed only where its value appears in the chunk.
      const facts = projection.projects.flatMap((p) => p.facts);
      pages[page.path[locale]] = { scope: key, title };
      entries.push(...sectionEntries({ scope: key, kind: 'page', locale, prefix: title, sections: page.sections[locale], facts, tags: ['page', key], pagePath: page.path[locale] }));
    }
    pages[locale === 'zh' ? '/zh/' : '/'] = { scope: 'home', title: locale === 'zh' ? '首页' : 'Home' };
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  const seen = new Set();
  for (const e of entries) {
    if (seen.has(e.id)) throw new Error(`build-worldbook: duplicate entry id ${e.id}`);
    seen.add(e.id);
  }
  const projectNames = projection.projects.map((p) => ({scope: p.slug, title: p.title, aliases: p.aliases ?? []}));
  const worldbook = { schemaVersion: 1, aliases: aliasGroups, projectNames, pages, entries };
  const knowledgeVersion = hash(JSON.stringify(worldbook));
  return { worldbook: { ...worldbook, knowledgeVersion }, knowledgeVersion };
}
