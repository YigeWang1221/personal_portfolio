// Locale-aware formatting that follows docs/style/BILINGUAL_STYLE.md.
//   EN: "Dec 2026", same-year range "Mar–Apr 2026", cross-year "Jan 2025 – Dec 2026", years "2020–2024".
//   ZH: "2026 年 12 月", same-year range "2026 年 3—4 月", cross-year "2025 年 1 月—2026 年 12 月", years "2020—2024 年".
import type { Locale } from './i18n';
import type { Period, StatusKey } from './content/schema';
import { t } from './content/load';

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface Point {
  year: number;
  month?: number;
}

function parse(value: string): Point {
  const [y, m] = value.split('-');
  return { year: Number(y), month: m ? Number(m) : undefined };
}

function enPoint(p: Point): string {
  return p.month ? `${EN_MONTHS[p.month - 1]} ${p.year}` : `${p.year}`;
}

function zhPoint(p: Point): string {
  return p.month ? `${p.year} 年 ${p.month} 月` : `${p.year} 年`;
}

export function formatPeriod(period: Period, locale: Locale): string {
  const start = parse(period.start);
  const end = period.end ? parse(period.end) : null;
  let text: string;
  if (locale === 'en') {
    if (!end) text = `${enPoint(start)} – ${t(locale, 'common.present')}`;
    else if (!start.month && !end.month) text = `${start.year}–${end.year}`;
    else if (start.year === end.year && start.month && end.month) {
      text = start.month === end.month ? enPoint(start) : `${EN_MONTHS[start.month - 1]}–${EN_MONTHS[end.month - 1]} ${end.year}`;
    } else text = `${enPoint(start)} – ${enPoint(end)}`;
  } else {
    if (!end) text = `${zhPoint(start)}${t(locale, 'common.present')}`;
    else if (!start.month && !end.month) text = `${start.year}—${end.year} 年`;
    else if (start.year === end.year && start.month && end.month) {
      text = start.month === end.month ? zhPoint(start) : `${start.year} 年 ${start.month}—${end.month} 月`;
    } else text = `${zhPoint(start)}—${zhPoint(end)}`;
  }
  if (period.expected) text += t(locale, 'common.expected_suffix');
  return text;
}

export interface Team {
  size: number;
  mixed?: boolean;
}

/** "Solo" / "Team of 3" / "Solo and in pairs" for meta rows. */
export function teamLabel(team: Team, locale: Locale): string {
  if (team.mixed) return t(locale, 'team.mixed');
  return team.size === 1 ? t(locale, 'team.solo') : t(locale, 'team.of', { n: team.size });
}

/** Legacy status keys retain project/team display without classifying work by educational origin. */
const STATUS_WITH_TEAM: ReadonlySet<StatusKey> = new Set(['course-project', 'course-benchmark', 'undergraduate-capstone']);

export function statusLabel(status: StatusKey, team: Team, locale: Locale): string {
  const base = t(locale, `status.${status}`);
  if (!STATUS_WITH_TEAM.has(status)) return base;
  if (team.mixed) return base + t(locale, 'team.suffix_mixed');
  const suffix = team.size === 1 ? t(locale, 'team.suffix_solo') : t(locale, 'team.suffix_team', { n: team.size });
  return base + suffix;
}

/** Visual family of a status badge. */
export function statusTone(status: StatusKey): 'live' | 'built' | 'course' | 'research' | 'archived' {
  switch (status) {
    case 'self-hosted-pilot':
      return 'live';
    case 'implemented-not-deployed':
      return 'built';
    case 'research-prototype':
      return 'research';
    case 'archived':
      return 'archived';
    default:
      return 'course';
  }
}
