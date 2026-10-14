import type { ProjectMeta } from './content/schema';

/**
 * The one GitHub link shown next to a project title (ADR-027): the repository when there is one, the owner's page
 * when several repositories share a GitHub owner, otherwise the first repository. Undefined without public code.
 */
export function githubHref(links: ProjectMeta['links']): string | undefined {
  const repos = links.filter((l) => l.kind === 'code');
  if (repos.length === 0) return undefined;
  if (repos.length === 1) return repos[0].url;
  const urls = repos.map((l) => new URL(l.url));
  const owners = new Set(urls.map((u) => u.pathname.split('/')[1]));
  return urls.every((u) => u.hostname === 'github.com') && owners.size === 1 ? `https://github.com/${[...owners][0]}` : repos[0].url;
}
