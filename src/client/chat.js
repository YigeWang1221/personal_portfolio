// AI assistant client (ADR-022, SDD-AICHAT-001 §5.4, §6.2). Served as /js/chat.js only when PUBLIC_CHAT_ENABLED=true.
// Progressive enhancement: the widget markup ships hidden and this script reveals it. The page never depends on it.
//
// - State lives in sessionStorage ("pfchat:v1"): open/closed and the completed turns (at most 8 rounds, 64 KB).
//   It survives page changes and reloads in the same tab and is gone when the tab closes. Partial answers and
//   refusals (finishReason "refused" / "blocked") are shown but never stored, so an off-topic exchange never becomes
//   context for the next question. If storage is unavailable, the state is kept in memory only.
// - Answers are rendered with textContent only; "[Sn]" tags become links to the site-internal pages the server
//   sent as sources. No Markdown, no HTML from the model.
// - Coexists with site.js: no "#" links, no history.pushState, events handled on the widget's own elements.
(function () {
  'use strict';

  var STORAGE_KEY = 'pfchat:v1';
  var MAX_ROUNDS = 8;
  var MAX_BYTES = 64 * 1024;
  var MAX_FRAME = 64 * 1024;

  // Pure helpers (exported for tests) ---------------------------------------------------------------------

  /** Incremental SSE parser: LF / CRLF / CR, frames split across chunks, comments, streaming UTF-8. */
  function createSseParser() {
    var decoder = new TextDecoder('utf-8');
    var buffer = '';
    var data = [];
    var event = '';
    var size = 0;
    var pendingCR = false;
    function line(l, out) {
      if (l === '') {
        if (data.length || event) out.push({ event: event || 'message', data: data.join('\n') });
        data = [];
        event = '';
        size = 0;
        return;
      }
      size += l.length;
      if (size > MAX_FRAME) throw new Error('SSE frame too large');
      if (l.charAt(0) === ':') return;
      var i = l.indexOf(':');
      var field = i === -1 ? l : l.slice(0, i);
      var value = i === -1 ? '' : l.slice(i + 1);
      if (value.charAt(0) === ' ') value = value.slice(1);
      if (field === 'data') data.push(value);
      else if (field === 'event') event = value;
    }
    function push(chunk, final) {
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: !final });
      var out = [];
      var start = 0;
      for (var i = 0; i < buffer.length; i++) {
        var ch = buffer.charAt(i);
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
      if (buffer.length > MAX_FRAME) throw new Error('SSE line too large');
      return out;
    }
    return { push: push };
  }

  /** Only root-relative paths on this site: "/x", never "//host" or "javascript:". */
  function safePath(p) {
    return typeof p === 'string' && p.charAt(0) === '/' && p.charAt(1) !== '/' && p.charAt(1) !== '\\';
  }

  /** Split answer text into text parts and citations of the sources the server sent; invented tags are dropped. */
  function splitCitations(text, sources) {
    var byId = {};
    var n = 0;
    (sources || []).forEach(function (s) {
      if (s && typeof s.id === 'string' && safePath(s.path) && !byId[s.id]) byId[s.id] = { id: s.id, path: s.path, title: String(s.title || ''), n: ++n };
    });
    var parts = [];
    // Single tags ("[S1]") and grouped ones ("[S1, S3]", "[S1，S2]").
    var re = /\[(S\d{1,2}(?:\s*[,，、]\s*S\d{1,2})*)\]/g;
    var last = 0;
    var m;
    while ((m = re.exec(text))) {
      if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) });
      m[1].split(/\s*[,，、]\s*/).forEach(function (id) {
        if (byId[id]) parts.push({ type: 'cite', id: id, n: byId[id].n, path: byId[id].path, title: byId[id].title });
      });
      last = re.lastIndex;
    }
    if (last < text.length) parts.push({ type: 'text', value: text.slice(last) });
    return parts;
  }

  /** Keep whole rounds only, at most MAX_ROUNDS and MAX_BYTES; the oldest round goes first. */
  function trimTurns(turns) {
    var list = turns.slice();
    while (list.length && list[0].role !== 'user') list.shift();
    while (list.length > MAX_ROUNDS * 2) list.splice(0, 2);
    while (list.length > 2 && JSON.stringify(list).length > MAX_BYTES) list.splice(0, 2);
    return list;
  }

  /** The history sent to the server: completed turns, role and text only. */
  function historyFor(turns) {
    return turns.map(function (t) {
      return { role: t.role, text: t.text };
    });
  }

  /** Accept only well-formed stored state; anything else starts fresh. */
  function sanitizeState(raw) {
    var fresh = { open: false, knowledgeVersion: '', turns: [] };
    if (!raw || typeof raw !== 'object') return fresh;
    var turns = Array.isArray(raw.turns)
      ? raw.turns.filter(function (t) {
          return t && (t.role === 'user' || t.role === 'assistant') && typeof t.text === 'string' && t.text.length <= 4000;
        }).map(function (t) {
          var turn = { role: t.role, text: t.text };
          if (t.role === 'assistant' && Array.isArray(t.sources)) {
            turn.sources = t.sources.filter(function (s) {
              return s && typeof s.id === 'string' && safePath(s.path);
            }).map(function (s) {
              return { id: s.id, path: s.path, title: String(s.title || '') };
            });
          }
          return turn;
        })
      : [];
    return { open: raw.open === true, knowledgeVersion: typeof raw.knowledgeVersion === 'string' ? raw.knowledgeVersion.slice(0, 64) : '', turns: trimTurns(turns) };
  }

  var api = { createSseParser: createSseParser, safePath: safePath, splitCitations: splitCitations, trimTurns: trimTurns, historyFor: historyFor, sanitizeState: sanitizeState };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (typeof document === 'undefined') return;

  // Widget ------------------------------------------------------------------------------------------------

  function init() {
    var root = document.querySelector('[data-pfchat]');
    if (!root || !window.fetch || !window.TextDecoder || !window.ReadableStream) return;
    var q = function (sel) {
      return root.querySelector(sel);
    };
    var launcher = q('[data-pfchat-launcher]');
    var panel = q('[data-pfchat-panel]');
    var log = q('[data-pfchat-log]');
    var starters = q('[data-pfchat-starters]');
    var status = q('[data-pfchat-status]');
    var form = q('[data-pfchat-form]');
    var input = q('[data-pfchat-input]');
    var sendButton = q('[data-pfchat-send]');
    var stopButton = q('[data-pfchat-stop]');
    var live = q('[data-pfchat-live]');
    var strings = {};
    try {
      strings = JSON.parse(root.getAttribute('data-strings') || '{}');
    } catch (e) {
      strings = {};
    }
    var locale = root.getAttribute('data-locale') === 'zh' ? 'zh' : 'en';
    var pagePath = root.getAttribute('data-page-path') || '';
    var endpoint = root.getAttribute('data-api') || '/api/chat';

    var memory = null;
    function loadState() {
      try {
        var raw = window.sessionStorage.getItem(STORAGE_KEY);
        if (raw) return sanitizeState(JSON.parse(raw));
      } catch (e) {
        /* storage blocked or corrupt: fall back to memory */
      }
      return memory || sanitizeState(null);
    }
    function saveState() {
      state.turns = trimTurns(state.turns);
      memory = state;
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch (e) {
        /* memory only */
      }
    }
    var state = loadState();
    var busy = false;
    var controller = null;

    function el(tag, className, text) {
      var node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }
    function setStatus(text) {
      status.textContent = text || '';
      status.hidden = !text;
    }
    function announce(text) {
      live.textContent = '';
      window.setTimeout(function () {
        live.textContent = text;
      }, 50);
    }
    function scrollDown() {
      log.scrollTop = log.scrollHeight;
    }
    function setBusy(on) {
      busy = on;
      sendButton.hidden = on;
      stopButton.hidden = !on;
    }

    function renderText(target, text, sources) {
      target.textContent = '';
      splitCitations(text, sources).forEach(function (part) {
        if (part.type === 'text') target.appendChild(document.createTextNode(part.value));
        else {
          var a = el('a', 'pfchat-cite', '[' + part.n + ']');
          a.href = part.path;
          a.title = part.title;
          target.appendChild(a);
        }
      });
    }
    function renderSources(bubble, sources) {
      var safe = (sources || []).filter(function (s) {
        return safePath(s.path);
      });
      if (!safe.length) return;
      bubble.appendChild(el('p', 'pfchat-sources-label', strings.sources || 'Sources'));
      var list = el('ol', 'pfchat-sources');
      safe.forEach(function (s) {
        var li = el('li');
        var a = el('a', '', s.title || s.path);
        a.href = s.path;
        li.appendChild(a);
        list.appendChild(li);
      });
      bubble.appendChild(list);
    }
    function addUser(text) {
      var node = el('div', 'pfchat-msg pfchat-msg-user');
      node.appendChild(el('span', 'visually-hidden', (strings.you || 'You') + ': '));
      node.appendChild(document.createTextNode(text));
      log.appendChild(node);
      return node;
    }
    function addAssistant(text, sources) {
      var node = el('div', 'pfchat-msg pfchat-msg-assistant');
      node.appendChild(el('span', 'visually-hidden', (strings.assistant || 'Assistant') + ': '));
      var body = el('p', 'pfchat-msg-text');
      node.appendChild(body);
      renderText(body, text, sources);
      renderSources(node, sources);
      log.appendChild(node);
      return { node: node, body: body };
    }
    function addNotice(text) {
      log.appendChild(el('p', 'pfchat-notice', text));
    }
    function renderAll() {
      Array.prototype.slice.call(log.children).forEach(function (child) {
        if (child !== starters) log.removeChild(child);
      });
      starters.hidden = state.turns.length > 0;
      state.turns.forEach(function (t) {
        if (t.role === 'user') addUser(t.text);
        else addAssistant(t.text, t.sources);
      });
      scrollDown();
    }

    function open(focus) {
      panel.hidden = false;
      launcher.hidden = true;
      launcher.setAttribute('aria-expanded', 'true');
      state.open = true;
      saveState();
      scrollDown();
      if (focus) input.focus();
    }
    function close() {
      panel.hidden = true;
      launcher.hidden = false;
      launcher.setAttribute('aria-expanded', 'false');
      state.open = false;
      saveState();
      launcher.focus();
    }

    function resize() {
      input.rows = 1;
      while (input.rows < 5 && input.scrollHeight > input.clientHeight) input.rows += 1;
    }

    function markPartial(bubble, note, question) {
      bubble.node.classList.add('is-partial');
      bubble.node.appendChild(el('p', 'pfchat-note', note));
      var again = el('button', 'pfchat-regenerate', strings.regenerate || 'Regenerate');
      again.type = 'button';
      again.addEventListener('click', function () {
        if (busy) return;
        log.removeChild(bubble.node);
        ask(question, { regenerate: true });
      });
      bubble.node.appendChild(again);
    }

    async function ask(question, opts) {
      opts = opts || {};
      question = String(question || '').trim();
      if (!question || busy) return;
      setBusy(true);
      starters.hidden = true;
      var userNode = opts.regenerate ? null : addUser(question);
      var bubble = addAssistant('', []);
      setStatus(strings.thinking);
      scrollDown();
      controller = new AbortController();
      var stopped = false;
      controller.signal.addEventListener('abort', function () {
        stopped = true;
      });
      var answer = '';
      var sources = [];
      var terminal = null;
      var failure = null;
      try {
        var body = { message: question, locale: locale, history: historyFor(state.turns) };
        if (pagePath) body.pagePath = pagePath;
        if (state.knowledgeVersion) body.knowledgeVersion = state.knowledgeVersion;
        var res = await window.fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          credentials: 'same-origin',
          signal: controller.signal,
        });
        if (res.status === 409 && !opts.retried) {
          // The site's knowledge changed since this conversation started: reset it and ask again once.
          state.turns = [];
          state.knowledgeVersion = '';
          saveState();
          setBusy(false);
          renderAll();
          addNotice(strings.reset);
          return ask(question, { retried: true });
        }
        var type = res.headers.get('content-type') || '';
        if (!res.ok || type.indexOf('text/event-stream') !== 0 || !res.body) {
          failure = res.status === 429 ? 'limited' : 'unavailable';
        } else {
          var reader = res.body.getReader();
          var parser = createSseParser();
          for (;;) {
            var chunk = await reader.read();
            if (chunk.done) break;
            var events = parser.push(chunk.value);
            for (var i = 0; i < events.length; i++) {
              var ev = events[i];
              var data;
              try {
                data = JSON.parse(ev.data);
              } catch (e) {
                continue;
              }
              if (ev.event === 'meta' && typeof data.knowledgeVersion === 'string') state.knowledgeVersion = data.knowledgeVersion;
              else if (ev.event === 'status' && data.stage === 'switching') setStatus(strings.switching);
              else if (ev.event === 'delta' && typeof data.text === 'string') {
                if (!answer) {
                  setStatus('');
                  announce(strings.started);
                }
                answer += data.text;
                bubble.body.textContent = answer;
                scrollDown();
              } else if (ev.event === 'replace' && typeof data.text === 'string') {
                // The server stopped an answer that left the portfolio: show its fixed reply instead.
                answer = data.text;
                sources = [];
                bubble.body.textContent = answer;
              } else if (ev.event === 'sources' && Array.isArray(data.items)) sources = data.items;
              else if (ev.event === 'done') terminal = { ok: true, keep: data.finishReason === 'stop' };
              else if (ev.event === 'error') terminal = { ok: false, partial: Boolean(data.partial), code: String(data.code || '') };
            }
            if (terminal) break;
          }
        }
      } catch (e) {
        if (!stopped) failure = 'unavailable';
      } finally {
        controller = null;
        setBusy(false);
        setStatus('');
      }

      if (stopped) {
        if (!answer) {
          log.removeChild(bubble.node);
          if (userNode) log.removeChild(userNode);
          input.value = question;
          return;
        }
        renderText(bubble.body, answer, sources);
        markPartial(bubble, strings.stopped, question);
        return;
      }
      if (terminal && terminal.ok) {
        renderText(bubble.body, answer, sources);
        renderSources(bubble.node, sources);
        if (terminal.keep) {
          state.turns.push({ role: 'user', text: question }, { role: 'assistant', text: answer, sources: sources });
          saveState();
        }
        announce(strings.finished);
        scrollDown();
        return;
      }
      if (answer) {
        // Text arrived, then the stream failed or ended without a terminal event: show it as incomplete.
        renderText(bubble.body, answer, sources);
        markPartial(bubble, strings.partial, question);
        scrollDown();
        return;
      }
      // Nothing arrived: put the question back so nothing typed is lost.
      log.removeChild(bubble.node);
      if (userNode) log.removeChild(userNode);
      if (!state.turns.length) starters.hidden = false;
      addNotice(failure === 'limited' ? strings.limited : strings.unavailable);
      input.value = question;
      resize();
      scrollDown();
    }

    launcher.addEventListener('click', function () {
      open(true);
    });
    q('[data-pfchat-close]').addEventListener('click', close);
    q('[data-pfchat-clear]').addEventListener('click', function () {
      if (controller) controller.abort();
      state.turns = [];
      saveState();
      renderAll();
      input.focus();
    });
    panel.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    });
    stopButton.addEventListener('click', function () {
      if (controller) controller.abort();
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var text = input.value;
      if (!text.trim() || busy) return;
      input.value = '';
      resize();
      ask(text);
    });
    input.addEventListener('keydown', function (event) {
      // Enter sends; Shift+Enter adds a line; never send while an IME is composing (Chinese input).
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
    input.addEventListener('input', resize);
    Array.prototype.forEach.call(root.querySelectorAll('[data-pfchat-starter]'), function (button) {
      button.addEventListener('click', function () {
        ask(button.textContent);
      });
    });

    renderAll();
    launcher.hidden = false;
    if (state.open) open(false);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
