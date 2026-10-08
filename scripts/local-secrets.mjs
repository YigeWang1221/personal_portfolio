// Values of the git-ignored backend/.env (ADR-022): model keys, the origin key and the stack's internal gateway URL.
// The output gates use this to fail if any of them ever appears in dist/ or in the knowledge snapshot. Only the
// variable NAME is ever reported, never the value. Short values (under 12 characters, such as "100") are skipped.
import { existsSync, readFileSync } from 'node:fs';

export function localSecretValues(file = 'backend/.env') {
  if (!existsSync(file)) return [];
  const out = [];
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^(['"])(.*)\1$/, '$2');
    if (value.length >= 12) out.push({ name: m[1], value });
  }
  return out;
}

/** Names of the variables whose values occur in the text. */
export function leakedSecretNames(text, secrets) {
  return secrets.filter((s) => text.includes(s.value)).map((s) => s.name);
}
