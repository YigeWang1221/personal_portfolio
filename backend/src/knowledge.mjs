// Knowledge snapshot loading (SDD-AICHAT-001 §5.6 "启动流程"). The world book and prompt bundle are baked into the
// image; their hashes must match the manifest. On any failure the server still starts, answers /api/health with
// "unavailable" and refuses chat, instead of restarting in a loop.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex } from '../../shared/ai/retrieve.mjs';

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function loadKnowledge(dir) {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
    const worldbookJson = readFileSync(join(dir, 'worldbook.json'), 'utf8');
    const bundleJson = readFileSync(join(dir, 'prompt-bundle.json'), 'utf8');
    if (manifest.schemaVersion !== 1) return { ok: false, error: 'schema' };
    if (sha256(worldbookJson) !== manifest.sha256?.worldbook || sha256(bundleJson) !== manifest.sha256?.promptBundle) return { ok: false, error: 'hash' };
    const worldbook = JSON.parse(worldbookJson);
    const bundle = JSON.parse(bundleJson);
    if (worldbook.schemaVersion !== 1 || bundle.version !== 1 || worldbook.knowledgeVersion !== manifest.knowledgeVersion) return { ok: false, error: 'schema' };
    return { ok: true, manifest, worldbook, bundle, index: buildIndex(worldbook), knowledgeVersion: manifest.knowledgeVersion };
  } catch {
    return { ok: false, error: 'missing' };
  }
}
