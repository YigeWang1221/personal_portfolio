// Rate limits, concurrency and the daily cap (SDD-AICHAT-001 §5.6 "限流与成本"). One process, counters in memory;
// the daily count is also written to a small JSON file so a restart does not reset it. If that file cannot be read
// or written, generation is refused (fail closed). The real spending limit lives in the providers' consoles.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const KEEP_DAYS = 7;

export function createLimits({ perMinute, perHour, maxConcurrent, dailyCap, stateDir, strikeLimit = 3, strikeWindowMs = 600_000, strikeBlockMs = 600_000, now = Date.now }) {
  const hits = new Map(); // clientId → timestamps within the last hour
  const strikes = new Map(); // clientId → timestamps of refused misuse (guard)
  const blockedUntil = new Map(); // clientId → time the temporary block ends
  let active = 0;
  const file = join(stateDir, 'daily.json');
  let days = {};
  let storageOk = true;
  try {
    mkdirSync(stateDir, { recursive: true });
    if (existsSync(file)) days = JSON.parse(readFileSync(file, 'utf8')).days ?? {};
  } catch {
    storageOk = false;
  }

  const today = () => new Date(now()).toISOString().slice(0, 10);
  const day = () => (days[today()] ??= { requests: 0, tokensIn: 0, tokensOut: 0 });
  function persist() {
    const keep = Object.keys(days).sort().slice(-KEEP_DAYS);
    days = Object.fromEntries(keep.map((k) => [k, days[k]]));
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, JSON.stringify({ days }));
    renameSync(tmp, file);
  }

  return {
    /** Sliding windows per client pseudonym: false when over either limit. */
    rate(clientId) {
      const t = now();
      const list = (hits.get(clientId) ?? []).filter((x) => t - x < HOUR);
      const lastMinute = list.filter((x) => t - x < MINUTE).length;
      if (lastMinute >= perMinute || list.length >= perHour) {
        hits.set(clientId, list);
        return false;
      }
      list.push(t);
      hits.set(clientId, list);
      if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((x) => t - x < HOUR)) hits.delete(k);
      return true;
    },
    /** Record one refused misuse; enough of them within the window block the visitor for a while. */
    strike(clientId) {
      const t = now();
      const list = (strikes.get(clientId) ?? []).filter((x) => t - x < strikeWindowMs);
      list.push(t);
      strikes.set(clientId, list);
      if (list.length >= strikeLimit) {
        blockedUntil.set(clientId, t + strikeBlockMs);
        strikes.delete(clientId);
      }
      if (strikes.size > 10_000) for (const [k, v] of strikes) if (!v.some((x) => t - x < strikeWindowMs)) strikes.delete(k);
    },
    /** Is the visitor temporarily blocked for repeated misuse? */
    blocked(clientId) {
      const until = blockedUntil.get(clientId);
      if (until === undefined) return false;
      if (until > now()) return true;
      blockedUntil.delete(clientId);
      return false;
    },
    /** A generation slot, or null when all are busy (no queueing). */
    acquire() {
      if (active >= maxConcurrent) return null;
      active++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          active--;
        }
      };
    },
    /** Count one request against today's cap before any provider is called. */
    reserveDaily() {
      if (!storageOk) return { ok: false, reason: 'storage' };
      const d = day();
      if (d.requests >= dailyCap) return { ok: false, reason: 'cap' };
      d.requests++;
      try {
        persist();
      } catch {
        d.requests--;
        storageOk = false;
        return { ok: false, reason: 'storage' };
      }
      return { ok: true };
    },
    settle({ tokensIn = 0, tokensOut = 0 }) {
      const d = day();
      d.tokensIn += tokensIn;
      d.tokensOut += tokensOut;
      try {
        persist();
      } catch {
        storageOk = false;
      }
    },
    status() {
      return { active, storageOk, capReached: day().requests >= dailyCap };
    },
  };
}
