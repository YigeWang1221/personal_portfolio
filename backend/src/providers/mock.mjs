// Mock provider for tests and local end-to-end runs (PROVIDER_MODE=mock). Costs nothing, calls nothing.
// A script is a list of steps: { delay, text } | { delay, error: { kind, status } } | { delay, finish, usage }
// | { hang: true } (never answers, until aborted). Every await honours the abort signal.
import { ProviderError } from './errors.mjs';

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason ?? new Error('aborted'));
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason ?? new Error('aborted'));
    }, { once: true });
  });

export function mockProvider(id, script) {
  const calls = [];
  return {
    id,
    calls,
    async *stream(prompt, signal) {
      calls.push(prompt);
      for (const step of typeof script === 'function' ? script(prompt) : script) {
        if (step.hang) {
          await sleep(2 ** 31 - 1, signal);
          continue;
        }
        if (step.delay) await sleep(step.delay, signal);
        if (step.error) throw new ProviderError(step.error.kind, { status: step.error.status });
        if (step.keepalive) yield { type: 'keepalive' };
        if (step.text !== undefined) yield { type: 'text', text: step.text };
        if (step.finish) {
          yield { type: 'finish', reason: step.finish, usage: step.usage };
          return;
        }
      }
      throw new ProviderError('protocol');
    },
  };
}

/** The local-development mock: a short answer in the question's language that cites the first source. */
export function demoScript(id) {
  return (prompt) => {
    const last = prompt.messages.at(-1)?.text ?? '';
    const zh = /[一-鿿]/.test(last.split('</instructions>').pop());
    const text = zh
      ? `（模拟回答，来自 provider ${id}）这是本地测试用的回答，没有调用任何模型。来源见 [S1]。`
      : `(Mock answer from provider ${id}.) This is a local test answer; no model was called. See [S1].`;
    return [...text.match(/.{1,12}/gsu).map((t) => ({ delay: 40, text: t })), { finish: 'stop', usage: { in: 0, out: 0 } }];
  };
}
