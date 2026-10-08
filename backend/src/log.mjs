// Field-whitelisted JSON logs (SDD-AICHAT-001 §5.6 "日志"). Never questions, answers, headers, keys or provider error
// bodies: only the fields named here reach stdout, whatever the caller passes.
const FIELDS = ['event', 'requestId', 'provider', 'outcome', 'errorClass', 'status', 'firstTextMs', 'totalMs', 'tokensIn', 'tokensOut', 'partial', 'attempts', 'providers', 'knowledgeVersion', 'reason'];
const SAFE_VALUE = /^[\w.:,\- ]{0,120}$/;

let sink = (line) => process.stdout.write(line + '\n');
export function setLogSink(fn) {
  sink = fn;
}

export function log(fields) {
  const out = { t: new Date().toISOString() };
  for (const k of FIELDS) {
    const v = fields[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string' && SAFE_VALUE.test(x));
    else if (typeof v === 'string' && SAFE_VALUE.test(v)) out[k] = v;
  }
  sink(JSON.stringify(out));
}
