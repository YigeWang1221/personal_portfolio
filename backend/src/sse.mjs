// Server-sent events (SDD-AICHAT-001 §6.2): an incremental parser for provider streams and a writer for the client.
// The parser accepts LF, CRLF and CR line ends, frames split across chunks and comment lines (": keep-alive"), and
// rejects a frame larger than maxFrameBytes. UTF-8 is decoded in streaming mode, so a character split across two
// network chunks is never garbled.

export class SseFrameTooLarge extends Error {}

export function createSseParser({ maxFrameBytes = 64 * 1024 } = {}) {
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let data = [];
  let event = '';
  let size = 0;
  let pendingCR = false;

  function line(l, out) {
    if (l === '') {
      if (data.length || event) out.push({ event: event || 'message', data: data.join('\n') });
      data = [];
      event = '';
      size = 0;
      return;
    }
    size += l.length;
    if (size > maxFrameBytes) throw new SseFrameTooLarge(`SSE frame over ${maxFrameBytes} bytes`);
    if (l.startsWith(':')) {
      out.push({ comment: l.slice(1).trim() });
      return;
    }
    const i = l.indexOf(':');
    const field = i === -1 ? l : l.slice(0, i);
    let value = i === -1 ? '' : l.slice(i + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') data.push(value);
    else if (field === 'event') event = value;
  }

  /** @param {Uint8Array | string} chunk @returns {({event: string, data: string} | {comment: string})[]} */
  function push(chunk, final = false) {
    buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: !final });
    const out = [];
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (pendingCR) {
        pendingCR = false;
        if (ch === '\n') {
          start = i + 1;
          continue;
        }
      }
      if (ch === '\n' || ch === '\r') {
        line(buffer.slice(start, i), out);
        if (ch === '\r') pendingCR = true;
        start = i + 1;
      }
    }
    buffer = buffer.slice(start);
    if (buffer.length > maxFrameBytes) throw new SseFrameTooLarge(`SSE line over ${maxFrameBytes} bytes`);
    return out;
  }

  return { push, end: () => push(new Uint8Array(), true) };
}

/** Writer for the client stream. Returns false once the connection is gone. */
export function sseWriter(res) {
  return {
    event(name, payload) {
      if (res.writableEnded || res.destroyed) return false;
      res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
      return true;
    },
    comment(text) {
      if (res.writableEnded || res.destroyed) return false;
      res.write(`: ${text}\n\n`);
      return true;
    },
  };
}
