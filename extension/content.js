// Watches the message box. On Enter or Send, scans the text and shows a pop-up
// if it looks private. Nothing is stored and nothing is sent anywhere.
(function () {
  'use strict';

  const site = EZSites.forHost(location.hostname);
  if (!site) return;

  let paused = false;
  let allowedText = null; // exact text the user chose to "Send anyway"
  let modalHost = null;
  let pillHost = null;

  const first = (selectors) => {
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  };
  const closestAny = (el, selectors) => {
    for (const s of selectors) {
      const m = el.closest(s);
      if (m) return m;
    }
    return null;
  };
  const readText = (el) => (typeof el.value === 'string' ? el.value : el.innerText || '').trim();

  const CSS = `
    :host { all: initial; --paper: #faf9f5; --card: #f0eee6; --ink: #1f1e1d; --muted: #73726c;
      --line: #dad9d4; --accent: #c96442; }
    @media (prefers-color-scheme: dark) {
      :host { --paper: #262624; --card: #30302e; --ink: #faf9f5; --muted: #a8a69e;
        --line: #4a4945; --accent: #d97757; }
    }
    * { box-sizing: border-box; font-family: 'EZ Plex Mono', ui-monospace, Menlo, Consolas, monospace; }
    .backdrop { position: fixed; inset: 0; background: rgba(31,30,29,.35); display: flex;
      align-items: center; justify-content: center; }
    .card { width: min(420px, calc(100vw - 32px)); background: var(--paper); color: var(--ink);
      border: 1px solid var(--line); border-radius: 12px; padding: 22px; box-shadow: 0 8px 30px rgba(31,30,29,.15); }
    h2 { margin: 0 0 4px; font-size: 17px; font-weight: 500; line-height: 1.3; }
    p { margin: 0 0 14px; font-size: 13px; color: var(--muted); }
    ul { list-style: none; margin: 0 0 18px; padding: 0; max-height: 180px; overflow: auto; }
    li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 10px; margin-bottom: 6px;
      background: var(--card); border-radius: 8px; font-size: 13px; }
    li code { color: var(--muted); word-break: break-all; }
    .quiet { margin: -8px 0 16px; font-size: 12px; }
    .note { color: var(--accent); font-size: 12px; }
    .cover { margin-bottom: 12px; }
    .cover button { width: 100%; }
    .credit { display: block; margin-top: 5px; font-size: 11px; color: var(--muted); text-align: center; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    button { cursor: pointer; border-radius: 8px; padding: 8px 12px; font-size: 12px; font-weight: 500;
      border: 1px solid var(--line); background: transparent; color: var(--ink); }
    button:hover { background: var(--card); }
    button.primary { background: var(--ink); border-color: var(--ink); color: var(--paper); }
    button.primary:hover { opacity: .88; }
    button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
    .pill { position: fixed; right: 16px; bottom: 16px; background: var(--paper); color: var(--muted);
      border: 1px solid var(--line); border-radius: 999px; padding: 7px 14px; font-size: 12px; }
    .pill.click { cursor: pointer; }
    .pill.click:hover { color: var(--ink); }
  `;

  // IBM Plex Mono is bundled in fonts/ and loaded from inside the extension (no network).
  // If it fails to load, the pop-up falls back to the system monospace font.
  for (const [weight, file] of [['400', 'IBMPlexMono-Regular'], ['500', 'IBMPlexMono-Medium']]) {
    const face = new FontFace('EZ Plex Mono', `url(${chrome.runtime.getURL(`fonts/${file}.woff2`)})`, { weight });
    face.load().then(() => document.fonts.add(face)).catch(() => {});
  }

  function mount() {
    const host = document.createElement('div');
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);
    document.documentElement.append(host);
    return { host, root };
  }

  function el(tag, props = {}, ...kids) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    node.append(...kids);
    return node;
  }

  function closeModal() {
    if (modalHost) modalHost.remove();
    modalHost = null;
  }

  function showPill(text, onClick) {
    if (pillHost) pillHost.remove();
    const { host, root } = mount();
    const pill = el('div', { className: 'pill' + (onClick ? ' click' : ''), textContent: text });
    if (onClick) pill.addEventListener('click', onClick);
    root.append(pill);
    pillHost = host;
  }
  function hidePill() {
    if (pillHost) pillHost.remove();
    pillHost = null;
  }

  // Labels for the cover-up button, rotated each time the pop-up opens. Credits are kept
  // to what we can stand behind: a named source where there is one, otherwise "idiom"/"slang".
  const COVER_LINES = [
    ["These aren't the droids", 'Obi-Wan Kenobi, Star Wars: A New Hope'],
    ["It's handled", 'Olivia Pope, Scandal'],
    ['Sweep it under the rug', 'Classic idiom'],
    ['Keep it on the DL', "Slang for 'down low'"],
    ['What happens in Vegas…', 'Las Vegas ad campaign, 2003 (and The Hangover)'],
    ['Bury the body', 'Every crime thriller ever'],
    ['First rule of Fight Club', 'Fight Club, 1999'],
  ];
  let coverLine = Math.floor(Math.random() * COVER_LINES.length);

  function flash(text) {
    showPill(text);
    const mine = pillHost;
    setTimeout(() => { if (pillHost === mine) hidePill(); }, 4000);
  }

  // Select a range inside a textarea or a text node, then type over it with the browser's own
  // insert command, so ChatGPT/Claude treat it as ordinary typing. Returns false if refused.
  function insertAt(node, start, end, text) {
    if (node.setSelectionRange) {
      node.focus();
      node.setSelectionRange(start, end);
    } else {
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    }
    return document.execCommand('insertText', false, text);
  }

  // Replaces every coverable key/password in the message box with a placeholder like [OPENAI_KEY].
  // Works one match at a time on each text node, so anything split across lines is left for the
  // user (the caller re-scans and says so). Returns how many were covered.
  function coverUp(composer) {
    const coverable = (text) => EZDetect.scan(text).find((h) => h.severity !== 'low' && h.redact);
    composer.focus();
    let covered = 0;
    for (let i = 0; i < 50; i++) {
      let target = null;
      if (typeof composer.value === 'string') {
        const hit = coverable(composer.value);
        if (hit) target = [composer, hit.redact];
      } else {
        const walker = document.createTreeWalker(composer, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n && !target; n = walker.nextNode()) {
          const hit = coverable(n.nodeValue);
          if (hit) target = [n, hit.redact];
        }
      }
      if (!target) break;
      const [node, r] = target;
      if (!insertAt(node, r.start, r.end, r.text)) break;
      covered++;
    }
    return covered;
  }

  function showModal(found, quiet, composer, note) {
    closeModal();
    const { host, root } = mount();
    modalHost = host;

    const edit = () => { closeModal(); composer.focus(); };
    const cover = () => {
      closeModal();
      const n = coverUp(composer);
      const all = EZDetect.scan(readText(composer));
      const left = all.filter((f) => f.severity !== 'low');
      if (left.length) {
        showModal(left, all.filter((f) => f.severity === 'low'), composer,
          (n ? `Covered ${n}, but not everything.` : "These can't be covered automatically.") + ' Please edit the rest by hand.');
        return;
      }
      composer.focus();
      flash(`Covered ${n} item${n === 1 ? '' : 's'}. Review your message, then send.`);
    };
    const sendAnyway = () => {
      allowedText = readText(composer);
      closeModal();
      const btn = first(site.send);
      if (btn) btn.click();
      else composer.focus(); // no button found: pressing Enter again now goes through
    };
    const pause = () => {
      paused = true;
      closeModal();
      showPill('EZ Wallet Guard paused on this tab. Click to resume.', () => {
        paused = false;
        hidePill();
      });
      composer.focus();
    };

    const canCover = found.some((f) => f.redact);
    const [coverLabel, coverCredit] = COVER_LINES[coverLine++ % COVER_LINES.length];
    const coverBtn = el('button', {
      className: 'primary',
      textContent: coverLabel,
      title: 'Swap the secrets in your message for placeholders like [OPENAI_KEY]. Nothing is sent.',
    });
    coverBtn.addEventListener('click', cover);
    const editBtn = el('button', { className: canCover ? '' : 'primary', textContent: 'Abort mission' });
    editBtn.addEventListener('click', edit);
    const sendBtn = el('button', { textContent: 'Send anyway' });
    sendBtn.addEventListener('click', sendAnyway);
    const pauseBtn = el('button', { textContent: 'Pause for this tab' });
    pauseBtn.addEventListener('click', pause);

    const list = el('ul');
    for (const f of found) {
      list.append(el('li', {}, el('span', { textContent: f.label }), el('code', { textContent: f.masked })));
    }

    const counts = {};
    for (const q of quiet) counts[q.label] = (counts[q.label] || 0) + 1;
    const quietText = Object.entries(counts)
      .map(([label, n]) => label.toLowerCase() + (n > 1 ? ` ×${n}` : ''))
      .join(', ');

    const card = el('div', { className: 'card', role: 'alertdialog' },
      el('h2', { textContent: 'Hey, this looks private' }),
      el('p', { textContent: `Found in your message. Send it to ${site.name} anyway?` }),
      list,
      ...(quietText ? [el('p', { className: 'quiet', textContent: `Also noticed: ${quietText}.` })] : []),
      ...(note ? [el('p', { className: 'note', textContent: note })] : []),
      ...(canCover ? [el('div', { className: 'cover' }, coverBtn, el('span', { className: 'credit', textContent: `~ ${coverCredit}` }))] : []),
      el('div', { className: 'row' }, editBtn, sendBtn, pauseBtn));
    card.setAttribute('aria-label', 'Private data warning');

    const backdrop = el('div', { className: 'backdrop' }, card);
    backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop) edit(); });
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); edit(); }
      e.stopPropagation(); // keep keystrokes away from the page while the pop-up is open
    });
    root.append(backdrop);
    (canCover ? coverBtn : editBtn).focus(); // safe default: neither button sends anything
  }

  // Returns true if the send was blocked.
  function guard(event, composer) {
    if (paused) return false;
    const text = readText(composer);
    if (!text) return false;
    if (allowedText !== null && text === allowedText) {
      allowedText = null;
      return false;
    }
    const all = EZDetect.scan(text);
    // Emails and phones alone are too noisy to interrupt for; they only ride along
    // as a quiet line when something louder (a key or password) triggers the pop-up.
    const found = all.filter((f) => f.severity !== 'low');
    if (!found.length) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    showModal(found, all.filter((f) => f.severity === 'low'), composer);
    return true;
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.isComposing || !e.isTrusted) return;
    if (!(e.target instanceof Element)) return;
    const composer = closestAny(e.target, site.composer);
    if (composer) guard(e, composer);
  }, true);

  document.addEventListener('click', (e) => {
    if (!(e.target instanceof Element) || !closestAny(e.target, site.send)) return;
    const composer = first(site.composer);
    if (composer) guard(e, composer);
  }, true);

  // Fail visibly: if the page changed and we cannot find the message box, say so.
  let tries = 0;
  const timer = setInterval(() => {
    if (first(site.composer)) return clearInterval(timer);
    if (++tries >= 15) {
      clearInterval(timer);
      showPill("EZ Wallet Guard can't find the message box on this page, so it is NOT protecting you here.");
    }
  }, 1000);
})();
