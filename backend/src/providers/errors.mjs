// Provider failures, classified by the fallback table (SDD-AICHAT-001 §5.6 "切换判定表").
export class ProviderError extends Error {
  /**
   * @param {'network'|'timeout'|'http'|'protocol'|'empty'} kind
   * @param {{status?: number}} [info]
   */
  constructor(kind, info = {}) {
    super(info.status ? `${kind} ${info.status}` : kind);
    this.kind = kind;
    this.status = info.status;
  }
}

/** Read and drop an error body without keeping or logging it. */
export async function discard(res) {
  try {
    await res.body?.cancel();
  } catch {
    /* ignore */
  }
}
