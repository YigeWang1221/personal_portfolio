// Test helpers: build the site and the AI artifacts in a throwaway copy of the repository, so content can be
// changed without touching the working tree. node_modules is linked, not copied.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export const ROOT = resolve(import.meta.dirname, '..', '..');
const COPY = ['src', 'content', 'public', 'scripts', 'shared', 'astro.config.mjs', 'package.json', 'tsconfig.json'];

export function tempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'pf-ai-'));
  for (const item of COPY) cpSync(join(ROOT, item), join(dir, item), { recursive: true });
  symlinkSync(join(ROOT, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return {
    dir,
    read: (p) => readFileSync(join(dir, p), 'utf8'),
    write: (p, text) => writeFileSync(join(dir, p), text),
    edit(p, fn) {
      this.write(p, fn(this.read(p)));
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

const run = (cwd, cmd, args, env = {}) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });

/** astro build → postbuild → build-ai → check-ai-artifacts, in the temp repo. Returns the artifacts. */
export function buildAll(repo, env = {}) {
  run(repo.dir, process.execPath, ['node_modules/astro/bin/astro.mjs', 'build', '--silent'], env);
  run(repo.dir, process.execPath, ['scripts/postbuild.mjs'], env);
  run(repo.dir, process.execPath, ['scripts/build-ai.mjs'], env);
  run(repo.dir, process.execPath, ['scripts/check-ai-artifacts.mjs'], env);
  return readArtifacts(repo.dir);
}

export function readArtifacts(dir, generated = 'generated') {
  const ai = join(dir, generated, 'ai');
  const worldbookJson = readFileSync(join(ai, 'worldbook.json'), 'utf8');
  return {
    worldbookJson,
    worldbook: JSON.parse(worldbookJson),
    bundle: JSON.parse(readFileSync(join(ai, 'prompt-bundle.json'), 'utf8')),
    manifest: JSON.parse(readFileSync(join(ai, 'manifest.json'), 'utf8')),
  };
}

/** A small, fictional projection for unit tests that do not need a site build. */
export function fixtureProjection() {
  const l = (en, zh) => ({ en, zh });
  const fact = (key, value) => ({ key, value: l(value, value), label: l('latency', '延迟'), condition: l('one test machine', '单台测试机') });
  return {
    schemaVersion: 1,
    locales: ['en', 'zh'],
    order: ['lumen'],
    focus: [{ id: 'backend-cloud', title: l('Backend & Cloud', '后端与云'), description: l('APIs', 'API') }],
    profile: {
      name: l('Test Owner', '测试者'),
      headline: l('Software Engineer', '软件工程师'),
      email: 'wang.yige@northeastern.edu',
      links: [{ label: l('GitHub', 'GitHub'), url: 'https://github.com/example' }],
      education: [{ school: l('Example University', '示例大学'), degree: l('MS', '硕士'), location: l('Boston', '波士顿'), period: l('2025–2026', '2025—2026 年'), details: [] }],
      experience: [{ org: l('Example Co', '示例公司'), role: l('Intern', '实习生'), location: l('Remote', '远程'), period: l('2023', '2023 年'), bullets: [l('Built things', '做了一些东西')] }],
      highlights: [{ project: 'lumen', fact: fact('p50', '12.3 ms') }],
      skills: [{ group: l('Languages', '语言'), items: [{ name: l('Go', 'Go'), evidence: ['lumen'] }] }],
      path: l('/resume/', '/zh/resume/'),
    },
    projects: [
      {
        slug: 'lumen',
        title: l('Lumen', 'Lumen'),
        subtitle: l('A job scheduler', '任务调度器'),
        summary: l('Schedules jobs.', '调度任务。'),
        focus: { primary: 'backend-cloud', also: [] },
        status: l('Project (team of 4)', '项目（4 人团队）'),
        team: l('Team of 4', '4 人团队'),
        teamSize: 4,
        role: l('I designed the queue.', '我设计了队列。'),
        context: l('Scheduling', '调度'),
        period: l('2026', '2026 年'),
        stack: ['Go', 'PostgreSQL'],
        links: [],
        facts: [fact('p50', '12.3 ms')],
        path: l('/projects/lumen/', '/zh/projects/lumen/'),
        sections: {
          en: [{ id: 'queue', title: 'The queue', text: 'The median latency was 12.3 ms.', facts: ['p50'], path: '/projects/lumen/#queue' }],
          zh: [{ id: 'queue', title: '队列', text: '延迟中位数为 12.3 ms。', facts: ['p50'], path: '/zh/projects/lumen/#queue' }],
        },
      },
    ],
    pages: {
      background: { path: l('/background/', '/zh/background/'), sections: { en: [], zh: [] } },
      plan: { path: l('/plan-and-design/', '/zh/plan-and-design/'), sections: { en: [], zh: [] } },
    },
  };
}
