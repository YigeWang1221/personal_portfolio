// Markdown handling for narratives (ADR-015).
//
// Narratives are plain Markdown split into sections by "## Title {#id}" headings. IDs are the same in
// every language, so anchors, the table of contents and the parity check do not depend on wording.
// Numbers come from meta.yaml through {{fact:key}} references. Raw HTML and inline images are rejected:
// figures are attached to sections from meta.yaml.
import { Marked, type Tokens } from 'marked';
import type { Fact, Term } from './schema';
import type { Locale } from '../i18n';
import { localePath } from '../i18n';

export interface RawSection {
  id: string;
  title: string;
  body: string;
}

export interface RenderedSection {
  id: string;
  title: string;
  html: string;
  /** IDs of ### / #### headings inside the section. */
  subIds: string[];
}

const H2 = /^##\s+(.+?)\s*\{#([a-z0-9-]+)\}\s*$/;
const HEADING_ID = /\s*\{#([a-z0-9-]+)\}\s*$/;
// Project narratives use local keys ({{fact:tests}}); page narratives use {{fact:kk-knock.tests}}.
const FACT_REF = /\{\{fact:([a-z0-9_.-]+)\}\}/g;

/**
 * Numbers that look like measurements must come from facts. Checked on the narrative text after fact
 * references are removed. Design parameters without these units (e.g. "12-second windows", "3 AZs")
 * are allowed in prose.
 */
const METRIC_PATTERNS: RegExp[] = [
  /\d(?:[\d,]*\d)?(?:\.\d+)?\s?%/,
  /\d(?:\.\d+)?\s?×/,
  /\d(?:[\d,]*\d)?(?:\.\d+)?\s?(?:ms|GB|MB|KB)\b/,
  /\d(?:[\d,]*\d)?(?:\.\d+)?\s?s\b/,
  /\d(?:[\d,]*\d)?(?:\.\d+)?\s?(?:tokens?|tok)\/s/,
  /\$\s?\d/,
  /\d(?:\.\d+)?\s?(?:倍|毫秒|秒|万)/,
];

export function splitSections(source: string, file: string, errors: string[]): RawSection[] {
  const sections: RawSection[] = [];
  let current: RawSection | null = null;
  const preamble: string[] = [];
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    if (/^#\s/.test(line)) {
      errors.push(`${file}: H1 headings are not allowed (the page template renders the title)`);
      continue;
    }
    if (/^##\s/.test(line)) {
      const m = H2.exec(line);
      if (!m) {
        errors.push(`${file}: every "##" heading needs an explicit id, e.g. "## Architecture {#architecture}": ${line}`);
        continue;
      }
      current = { id: m[2], title: m[1].trim(), body: '' };
      sections.push(current);
      continue;
    }
    if (current) current.body += line + '\n';
    else preamble.push(line);
  }
  if (preamble.join('').trim()) {
    errors.push(`${file}: text before the first "##" section is not allowed`);
  }
  const seen = new Set<string>();
  for (const s of sections) {
    if (seen.has(s.id)) errors.push(`${file}: duplicate section id "${s.id}"`);
    seen.add(s.id);
  }
  return sections;
}

export function factRefs(text: string): string[] {
  return [...text.matchAll(FACT_REF)].map((m) => m[1]);
}

export function metricViolations(text: string): string[] {
  const withoutFacts = text.replace(FACT_REF, '').replace(/`[^`]*`/g, '');
  const hits: string[] = [];
  for (const line of withoutFacts.split('\n')) {
    for (const re of METRIC_PATTERNS) {
      const m = re.exec(line);
      if (m) {
        hits.push(`"${line.trim().slice(Math.max(0, m.index - 30), m.index + 30)}"`);
        break;
      }
    }
  }
  return hits;
}

function valueText(value: Term, locale: Locale): string {
  return typeof value === 'string' ? value : value[locale];
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface RenderOptions {
  locale: Locale;
  facts: Record<string, Fact>;
  file: string;
  errors: string[];
}

/** Render one section body to HTML. Fact values replace their references before parsing. */
export function renderSection(section: RawSection, opts: RenderOptions): RenderedSection {
  const { locale, facts, file, errors } = opts;
  const subIds: string[] = [];
  const placeholders: string[] = [];

  const body = section.body.replace(FACT_REF, (_, key: string) => {
    const f = facts[key];
    if (!f) {
      errors.push(`${file}: unknown fact "{{fact:${key}}}" in section "${section.id}"`);
      return '';
    }
    placeholders.push(`<span class="fact">${escapeHtml(valueText(f.value, locale))}</span>`);
    return `FACTPLACEHOLDER${placeholders.length - 1}X`;
  });

  const marked = new Marked({
    gfm: true,
    breaks: false,
    async: false,
    renderer: {
      html(token: Tokens.HTML | Tokens.Tag) {
        errors.push(`${file}: raw HTML is not allowed in narratives (section "${section.id}"): ${token.text.trim().slice(0, 60)}`);
        return '';
      },
      image(token: Tokens.Image) {
        errors.push(`${file}: inline images are not allowed; attach figures in meta.yaml (section "${section.id}"): ${token.href}`);
        return '';
      },
      heading(token: Tokens.Heading) {
        if (token.depth <= 2) {
          errors.push(`${file}: unexpected level-${token.depth} heading inside section "${section.id}"`);
        }
        let inner = this.parser.parseInline(token.tokens);
        const m = HEADING_ID.exec(inner);
        let idAttr = '';
        if (m) {
          inner = inner.slice(0, m.index);
          subIds.push(m[1]);
          idAttr = ` id="${m[1]}"`;
        }
        return `<h${token.depth}${idAttr}>${inner}</h${token.depth}>\n`;
      },
      link(token: Tokens.Link) {
        const text = this.parser.parseInline(token.tokens);
        let href = token.href;
        if (href.startsWith('/')) {
          href = localePath(locale, href);
        } else if (!/^https:\/\//.test(href) && !href.startsWith('#')) {
          errors.push(`${file}: links must be https://, root-relative or #anchors (section "${section.id}"): ${href}`);
        }
        const title = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        return `<a href="${escapeHtml(href)}"${title}>${text}</a>`;
      },
    },
  });

  let html = marked.parse(body) as string;
  html = html.replace(/FACTPLACEHOLDER(\d+)X/g, (_, i: string) => placeholders[Number(i)] ?? '');
  html = html.replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, '</table></div>');
  return { id: section.id, title: section.title, html, subIds };
}
