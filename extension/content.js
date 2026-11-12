// Relay context handoff (prototype).
// Records the live chat on the page into chrome.storage.session (via the background worker),
// so it survives a reload and is erased when the browser closes, and offers it on a
// different AI site. Nothing leaves the browser.
(() => {
  const MAX_MSGS = 8; // how many recent messages go into a pasted context block
  const MAX_CHARS = 1200;
  // Chrome's on-device Summarizer is slow: it loads a model, then summarizes the chat chunk by chunk.
  // Off by default so the rule-based summary below is used instead, which is instant.
  const USE_MODEL = false;
  // The pasted text is typed into the chat box in small steps so you can watch it arrive, like an AI
  // answer streaming in. This is the most time it may take in total (milliseconds); 0 pastes it at once.
  const TYPE_MS = 1500;

  const liTexts = (el) => [...el.querySelectorAll("li")].map((li) => li.innerText.trim());
  const pick = (el, role) => ({ role, text: el.innerText.replace(/^(ChatGPT said|You said):\s*/i, "").trim(), li: liTexts(el) });

  // Page selectors are not an official API and break when the sites change. ChatGPT, Gemini
  // and Claude were cross-checked against the open-source Clio extension's 2026-10 selectors;
  // Copilot, Grok and Perplexity are best guesses that have not been tested on the live sites.
  // ChatGPT changed its markup in 2026-10: messages are now divs whose
  // data-chatgpt-search-unit-key ends in ":user" or ":assistant". The older
  // data-message-author-role attribute is kept as a fallback.
  const chatgpt = {
    name: "ChatGPT",
    messages: () =>
      [
        ...document.querySelectorAll(
          '[data-chatgpt-search-unit-key$=":user"], [data-chatgpt-search-unit-key$=":assistant"], [data-message-author-role]'
        ),
      ].map((el) => {
        const key = el.getAttribute("data-chatgpt-search-unit-key") || "";
        const role = el.getAttribute("data-message-author-role") || (key.endsWith(":user") ? "user" : "assistant");
        return pick(el, role === "user" ? "user" : "assistant");
      }),
    input: () => document.querySelector("#prompt-textarea"),
  };
  const SITES = {
    "chatgpt.com": chatgpt,
    "chat.openai.com": chatgpt,
    "gemini.google.com": {
      name: "Gemini",
      messages: () =>
        [...document.querySelectorAll("user-query, model-response")].map((el) =>
          pick(el, el.tagName.toLowerCase() === "user-query" ? "user" : "assistant")
        ),
      input: () => document.querySelector("rich-textarea .ql-editor, div[contenteditable='true']"),
    },
    "claude.ai": {
      name: "Claude",
      messages: () =>
        [...document.querySelectorAll("[data-testid='user-message'], .font-claude-response, [data-testid='assistant-message']")].map((el) =>
          pick(el, el.getAttribute("data-testid") === "user-message" ? "user" : "assistant")
        ),
      input: () => document.querySelector("div[contenteditable='true']"),
    },
    "copilot.microsoft.com": {
      name: "Copilot",
      messages: () =>
        [...document.querySelectorAll("[data-content='user-message'], [data-content='ai-message']")].map((el) =>
          pick(el, el.getAttribute("data-content") === "user-message" ? "user" : "assistant")
        ),
      input: () => document.querySelector("textarea, div[contenteditable='true']"),
    },
    "grok.com": {
      name: "Grok",
      messages: () =>
        [...document.querySelectorAll("div[id^='response-']")].map((el) =>
          pick(el, el.classList.contains("items-end") ? "user" : "assistant")
        ),
      input: () => document.querySelector("textarea, div[contenteditable='true']"),
    },
    "www.perplexity.ai": {
      name: "Perplexity",
      messages: () =>
        [...document.querySelectorAll("[id^='markdown-content-'], h1[class*='query'], div[class*='group/query']")].map((el) =>
          pick(el, el.id.startsWith("markdown-content-") ? "assistant" : "user")
        ),
      input: () => document.querySelector("textarea, div[contenteditable='true']"),
    },
  };

  const site = SITES[location.hostname];
  if (!site) return;

  // All storage goes through the background worker (see background.js).
  const send = (msg) =>
    new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(msg, (r) => resolve(chrome.runtime.lastError ? null : r));
      } catch {
        resolve(null); // the extension was reloaded while this tab stayed open
      }
    });
  // Anything that goes wrong is logged and shown on the page for a few seconds, so a failure
  // on a live site can be read off the screen instead of hunting through DevTools.
  function report(where, e) {
    console.error("[Relay]", where, e);
    try {
      document.getElementById("ezw-toast")?.remove();
      const t = document.createElement("div");
      t.id = "ezw-toast";
      t.textContent = "Relay error (" + where + "): " + (e && e.message ? e.message : String(e));
      t.style.cssText = "position:fixed;left:16px;bottom:16px;z-index:2147483647;max-width:480px;padding:10px 14px;border-radius:10px;background:#111;color:#fff;font:13px/1.4 system-ui;box-shadow:0 4px 20px rgba(0,0,0,.4)";
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 20000);
    } catch {}
  }
  const convId = () => (location.pathname.replace(/\/+$/, "") || "/new") + location.search;

  // ---- baton drop or baton pass ----
  // "drop": the context waits and the user picks it up (clicks to paste). This is the default.
  // "pass": Relay puts the context into a new, empty chat on its own. It never presses send.
  const MODE_KEY = "ezw-mode";
  let mode = "drop";
  // The choice is made in the toolbar popup (popup.html) and saved in chrome.storage.local.
  const asMode = (v) => (v === "pass" ? "pass" : "drop");
  // The saved choice is the truth, not this tab's in-memory copy, which can go stale. Any failure means "drop".
  const storedMode = () =>
    new Promise((resolve) => {
      try {
        chrome.storage.local.get(MODE_KEY, (r) => resolve(chrome.runtime.lastError ? "drop" : asMode(r && r[MODE_KEY])));
      } catch {
        resolve("drop"); // the extension was reloaded under this tab: do nothing on our own
      }
    });
  try {
    chrome.storage.local.get(MODE_KEY, (r) => {
      if (!chrome.runtime.lastError) mode = asMode(r && r[MODE_KEY]);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local" && changes[MODE_KEY]) {
        mode = asMode(changes[MODE_KEY].newValue); // every open AI tab follows the popup
        if (mode === "pass") check();
      }
    });
  } catch {}

  // Baton pass: once per recorded chat per tab, and only into a fresh chat whose box is empty.
  const passed = new Set();
  async function autoPass(ctx) {
    if (mode !== "pass" || performance.now() < 3000) return; // let the page finish loading its own messages first
    if ((await storedMode()) !== "pass") {
      mode = "drop";
      return;
    }
    const token = ctx.host + ":" + ctx.savedAt;
    let done = passed.has(token);
    try {
      done = done || sessionStorage.getItem("ezw-passed") === token;
    } catch {}
    if (done) return;
    if (site.messages().some((m) => m.text)) return; // never into a chat that is already under way
    const box = findInput();
    if (!box) return; // the page is not ready yet: try again on the next check
    passed.add(token);
    try {
      sessionStorage.setItem("ezw-passed", token);
    } catch {}
    if ((box.value ?? box.innerText ?? "").trim()) return; // the user already started typing: leave it alone
    const text = await summaryBlock(ctx);
    if ((await storedMode()) !== "pass") return; // switched back to drop while the summary was being built
    if (!(await insert(text, true))) return;
    const note = document.getElementById("ezw-note");
    if (note) note.textContent = "Baton passed. Review it, then send when you're ready.";
  }

  // ---- summarize on the device ----
  function bullets(msg) {
    const lines = msg.li && msg.li.length
      ? msg.li
      : msg.text
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => /^([-*•]|\d+[.)])\s+/.test(l))
          .map((l) => l.replace(/^([-*•]|\d+[.)])\s+/, ""));
    return lines
      .map((l) => l.replace(/\*\*/g, ""))
      .map((l) => l.split(/[:\-–—]/)[0].trim())
      .filter((l) => l.length > 1 && l.length < 60);
  }

  // The summary shown in the panel is built from the stored conversation when it is read.
  function summarize(conv) {
    const recent = conv.messages.slice(-MAX_MSGS).map((m) => ({ role: m.role, text: m.text.slice(0, MAX_CHARS), li: m.li }));
    const firstUser = conv.messages.find((m) => m.role === "user");
    const lastAssistant = [...recent].reverse().find((m) => m.role === "assistant");
    return {
      source: conv.source,
      host: conv.host,
      savedAt: conv.updatedAt,
      topic: firstUser ? firstUser.text.split("\n")[0].slice(0, 140) : "",
      items: lastAssistant ? bullets(lastAssistant).slice(0, 8) : [],
      messages: recent,
      conv,
    };
  }

  // ---- capture ----
  let lastSig = "";
  async function capture() {
    if (stopIfOrphaned()) return;
    try {
      await captureNow();
    } catch (e) {
      report("recording", e);
    }
  }
  async function captureNow() {
    const msgs = site.messages().filter((m) => m.text);
    send({ type: "badge", count: msgs.length }); // toolbar badge: messages Relay can read on this tab
    if (!msgs.length) return;
    const id = convId();
    const sig = id + ":" + msgs.length + ":" + msgs[msgs.length - 1].text.length;
    if (sig === lastSig) return;
    lastSig = sig;
    // Long chats can drop old messages from the page; keep the longer record.
    const prev = await send({ type: "load", host: location.hostname, id });
    const messages = prev && prev.messages.length > msgs.length ? prev.messages : msgs;
    send({
      type: "save",
      conv: { id, host: location.hostname, source: site.name, url: location.href, title: document.title, messages, updatedAt: Date.now() },
    });
  }
  let timer, poll;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(capture, 1500);
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  capture();

  // ---- build the pasted summary ----
  // The pasted text must not reveal which AI the chat came from, so brand names are
  // scrubbed and roles are plain "Me" / "Assistant". Claude and Gemini are also ordinary
  // words and names, so they are only scrubbed when they are the source or in a
  // self-reference such as "I'm Claude".
  const BRANDS = /\b(chat\s?gpt|gpt-?\d[\w.-]*|openai|anthropic|grok|xai|copilot|perplexity|deepseek|mistral|bard|llama|meta ai)\b/gi;
  const SELF = /\b(i am|i'm|as|this is|called|named)\s+(claude|gemini)\b/gi;
  function anonymize(text, source) {
    let t = text.replace(BRANDS, "the assistant").replace(SELF, (_m, p) => p + " the assistant");
    if (source && /^(claude|gemini)$/i.test(source)) t = t.replace(new RegExp("\\b" + source + "\\b", "gi"), "the assistant");
    return t;
  }

  const clip = (t, n) => (t.length > n ? t.slice(0, n - 1).trimEnd() + "…" : t);
  const firstSentence = (t) => (t.replace(/\s+/g, " ").match(/^.{20,}?[.!?](?=\s|$)/) || [t.replace(/\s+/g, " ")])[0];

  // Key terms by counting, no model: words from my messages count double, and common filler words,
  // list numerals and AI brand names are skipped. The receiving AI makes sense of how they connect.
  const STOP = new Set(
    ("the and for are but not you your with that this have from was can will what how who why when where which would could should " +
      "there their here they them then than about into just also some any all more most very its let lets like want wanted need needs " +
      "get got use using please sure said say tell give make made list help know think does did done been being has had were our out " +
      "one two yes now new too each other such only own same ive im dont cant wont").split(" ")
  );
  function keyTerms(conv, n = 12) {
    const brand = new RegExp(BRANDS.source + "|^(claude|gemini)$", "i"); // not global, so test() keeps no state
    const score = new Map();
    for (const m of conv.messages) {
      const w = m.role === "user" ? 2 : 1;
      for (const tok of m.text.toLowerCase().match(/[a-z][a-z'-]{2,}|\$\d[\d,.]*|\d[\d,.]*%/g) || []) {
        if (STOP.has(tok) || brand.test(tok)) continue;
        score.set(tok, (score.get(tok) || 0) + w);
      }
    }
    return [...score].sort((a, b) => b[1] - a[1]).slice(0, n).map(([t]) => t);
  }

  // Fallback summary, built on the device with no model: the goal, what I asked, the key
  // points of each answer, and where the conversation stopped.
  function heuristicSummary(conv) {
    const msgs = conv.messages;
    const users = msgs.filter((m) => m.role === "user");
    const bots = msgs.filter((m) => m.role === "assistant");
    const out = [];
    if (users[0]) out.push("What I wanted: " + clip(users[0].text.replace(/\s+/g, " "), 400));
    if (users.length > 1) {
      out.push("Things I asked along the way:");
      users.slice(1, 8).forEach((m) => out.push("- " + clip(m.text.replace(/\s+/g, " "), 200)));
    }
    if (bots.length) {
      out.push("Key points from the answers:");
      bots.slice(-6).forEach((m) => {
        const lis = (m.li || []).filter((l) => l.length > 1);
        if (lis.length) lis.slice(0, 8).forEach((l) => out.push("- " + clip(l.replace(/\s+/g, " "), 220)));
        else out.push("- " + clip(firstSentence(m.text), 220));
      });
    }
    const last = users[users.length - 1];
    if (last && users.length > 1) out.push("Where it stands: my latest question was: " + clip(last.text.replace(/\s+/g, " "), 300));
    const terms = keyTerms(conv);
    if (terms.length) out.push("Key terms from the conversation: " + terms.join(", "));
    return out.join("\n");
  }

  // Preferred summary: Chrome's built-in on-device Summarizer, when its model is already
  // installed. Returns null when unavailable so the caller falls back.
  async function modelSummary(conv) {
    try {
      if (typeof Summarizer === "undefined" || (await Summarizer.availability()) !== "available") return null;
      const s = await Summarizer.create({
        type: "key-points",
        format: "plain-text",
        length: "long",
        outputLanguage: "en",
        sharedContext:
          "A conversation between a user (Me) and an AI assistant. Keep the specifics: goals, names, numbers, constraints, decisions, options considered and open questions.",
      });
      const text = conv.messages.map((m) => (m.role === "user" ? "Me: " : "Assistant: ") + m.text).join("\n\n").slice(-24000);
      const chunks = text.match(/[\s\S]{1,6000}/g) || [];
      const parts = [];
      for (const c of chunks) parts.push(await s.summarize(c));
      s.destroy();
      return parts.join("\n");
    } catch {
      return null;
    }
  }

  const cache = new Map();
  async function summaryBlock(ctx) {
    const key = ctx.host + ":" + ctx.savedAt;
    if (!cache.has(key)) {
      const body = (USE_MODEL && (await modelSummary(ctx.conv))) || heuristicSummary(ctx.conv);
      cache.set(key, anonymize(body, ctx.source));
    }
    return (
      "Background from an earlier conversation I had with another AI assistant (summarized). " +
      "Use it as context, and do not repeat it back to me:\n\n" +
      cache.get(key) +
      "\n\n"
    );
  }

  function suggestions(ctx) {
    const out = [];
    const list = ctx.items.slice(0, 5).join(", ");
    if (list) {
      out.push({ label: `Find where to buy: ${list.slice(0, 50)}`, prompt: `Find stores near me where I can buy: ${list}.` });
      out.push({ label: "Compare prices online", prompt: `Compare prices and delivery options online for: ${list}.` });
    }
    if (ctx.topic) out.push({ label: `Continue: ${ctx.topic.slice(0, 45)}`, prompt: "Continue helping me with this." });
    return out;
  }

  // Sites rename their markup, so when the site's own selector finds nothing usable, fall back to
  // any editable box the user can see. The chat box sits at the bottom of the page, so the lowest wins.
  const EDITABLE = "textarea, input[type='text'], [contenteditable]:not([contenteditable='false']), [role='textbox']";
  function usable(el) {
    if (!el || el.closest("#ezw-panel") || el.disabled || el.readOnly) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 80 && r.height > 15 && s.visibility !== "hidden" && s.display !== "none";
  }
  function findInput() {
    const own = site.input();
    if (usable(own)) return own;
    const found = [...document.querySelectorAll(EDITABLE)].filter(usable);
    const focused = found.find((el) => el.contains(document.activeElement));
    return focused || found.sort((a, b) => b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom)[0] || null;
  }

  // ---- typing effect ----
  const STEP_MS = 16;
  async function typeInto(box, text) {
    const type = (t) => document.execCommand("insertText", false, t);
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!TYPE_MS || reduced || document.hidden || text.length < 40) return void type(text); // a hidden tab throttles timers
    const words = text.match(/\S+\s*|\s+/g) || [text]; // each word keeps its trailing spaces and line breaks
    const per = Math.max(1, Math.ceil(words.length / (TYPE_MS / STEP_MS)));
    let i = 0;
    // A key press means the user wants to type: put the rest in at once, before their key, so nothing interleaves.
    const finish = () => {
      if (i < words.length) type(words.slice(i).join(""));
      i = words.length;
    };
    box.addEventListener("keydown", finish, { once: true, capture: true });
    while (i < words.length) {
      if (!box.isConnected) return; // the page replaced the box under us
      if (!box.contains(document.activeElement)) box.focus();
      type(words.slice(i, i + per).join(""));
      i += per;
      await new Promise((r) => setTimeout(r, STEP_MS));
    }
    box.removeEventListener("keydown", finish, { capture: true });
  }

  async function insert(text, quiet) {
    const box = findInput();
    if (!box) return quiet ? false : alert("Relay: couldn't find the chat box on this page.");
    box.focus();
    paused = true;
    pausedSnippet = text.slice(0, 30);
    setFab("match"); // the context is being delivered
    await typeInto(box, text);
    return true;
  }

  // ---- floating icon ----
  // A Relay icon floats on every supported AI page and opens or closes the panel.
  //   nothing typed yet, or no recorded chat: it sits still
  //   what you type relates to the recorded chat: it changes colour ("match")
  //   what you type does not relate: it slowly slides aside, out of the way
  // "Relates" is plain word overlap, not understanding, so a topic worded differently can be missed.
  // Colours and speeds live in panel.css (--ezw-match-a, --ezw-match-b).
  const MIN_SHARED = 2; // shared words that count as a match (one is enough when only 1 to 3 words were typed)
  const stem = (w) => {
    let s = w.length > 3 ? w.replace(/s$/, "") : w;
    if (s.length > 5) s = s.replace(/(ing|ed)$/, "");
    return s.length > 3 ? s.replace(/e$/, "") : s;
  };
  function termsOf(text) {
    const brand = new RegExp(BRANDS.source, "i");
    const out = new Set();
    for (const tok of text.toLowerCase().match(/[a-z][a-z'-]{2,}|\$\d[\d,.]*|\d[\d,.]*%/g) || []) {
      if (!STOP.has(tok) && !brand.test(tok)) out.add(stem(tok));
    }
    return out;
  }
  let current = null; // the chat recorded on another site, as last read by checkNow
  let vocab = { key: "", set: new Set() };
  function relates(typed) {
    if (!current) return null;
    const key = current.host + ":" + current.savedAt;
    if (vocab.key !== key) vocab = { key, set: termsOf(current.conv.messages.map((m) => m.text).join("\n")) };
    const mine = termsOf(typed);
    if (!mine.size) return null;
    const shared = [...mine].filter((t) => vocab.set.has(t)).length;
    return shared >= MIN_SHARED || (mine.size <= 3 && shared >= 1);
  }

  let dismissed = null; // savedAt of the chat whose panel the user closed, so it stays closed
  let paused = false; // Relay's own text is in the box: do not judge it until it is sent or cleared
  let pausedSnippet = "";

  function ensureFab() {
    let f = document.getElementById("ezw-fab");
    if (f) return f;
    // One element: a round wallet icon that grows into the panel (.ezw-body) and shrinks back.
    // The icon stays in the top-right corner and is also the open/close button.
    f = document.createElement("div");
    f.id = "ezw-fab";
    f.innerHTML = `<button type="button" class="ezw-orb" title="Relay"><img alt="" src="${chrome.runtime.getURL("icons/wallet-dark-48.png")}"></button><div class="ezw-body"></div>`;
    f.querySelector(".ezw-orb").onclick = () => {
      if (document.getElementById("ezw-panel")) {
        dismissed = current ? String(current.savedAt) : null; // stays closed until a newer chat arrives
        closePanel();
      } else if (!current) {
        showEmpty(); // nothing recorded from another AI yet: say so instead of doing nothing
      } else {
        dismissed = null;
        check();
      }
    };
    document.body.appendChild(f);
    return f;
  }
  // Size the dock to its content so the grow and shrink can animate, and keep it on screen.
  function layoutDock() {
    const f = ensureFab();
    const body = f.querySelector(".ezw-body");
    const open = !!document.getElementById("ezw-panel");
    f.classList.toggle("ezw-open", open);
    f.style.height = open ? body.offsetHeight + 2 + "px" : "";
    f.style.top = open ? Math.max(16, Math.min(Math.round(innerHeight * 0.45), innerHeight - body.offsetHeight - 18)) + "px" : "";
  }
  function closePanel() {
    const p = document.getElementById("ezw-panel");
    if (!p) return;
    p.id = "ezw-closing"; // no longer counts as open; removed once the box has shrunk back
    layoutDock();
    setTimeout(() => p.remove(), 600);
  }
  function setFab(state) {
    const f = ensureFab();
    f.classList.toggle("ezw-match", state === "match");
    f.classList.toggle("ezw-aside", state === "aside");
  }
  function judge() {
    if (stopIfOrphaned()) return;
    const box = findInput();
    const typed = box ? (box.value ?? box.innerText ?? "").trim() : "";
    if (!typed) {
      paused = false;
      return setFab("idle"); // box emptied or sent: start fresh
    }
    if (paused && typed.includes(pausedSnippet)) return;
    paused = false;
    const r = typed.length < 12 ? null : relates(typed); // too little typed to judge yet
    setFab(r === null ? "idle" : r ? "match" : "aside");
  }
  let judgeTimer;
  const onTyping = (e) => {
    if (stopIfOrphaned()) return;
    const box = findInput();
    if (!box || !(box === e.target || box.contains(e.target))) return;
    clearTimeout(judgeTimer);
    judgeTimer = setTimeout(judge, 400);
  };
  for (const ev of ["input", "keyup"]) document.addEventListener(ev, onTyping, true);

  // ---- UI ----
  function showEmpty() {
    document.getElementById("ezw-closing")?.remove();
    const el = document.createElement("div");
    el.id = "ezw-panel";
    el.dataset.empty = "1"; // checkNow leaves this one alone until a real chat arrives
    el.innerHTML = `<div class="ezw-head"><span class="ezw-title">Relay</span></div>
      <div class="ezw-sub">Nothing to hand off yet. Chat on one AI site, then open another, and Relay will offer your context here.</div>`;
    ensureFab().querySelector(".ezw-body").appendChild(el);
    layoutDock();
  }

  function showPanel(ctx) {
    document.getElementById("ezw-panel")?.remove();
    document.getElementById("ezw-closing")?.remove();
    const mins = Math.max(0, Math.round((Date.now() - ctx.savedAt) / 60000));
    const el = document.createElement("div");
    el.id = "ezw-panel";
    el.innerHTML = `<div class="ezw-head"><span class="ezw-title">Relay</span></div>
      <div class="ezw-sub">From ${ctx.source}${ctx.isLead ? " (your lead-off AI)" : ""}, ${mins === 0 ? "just now" : mins + " min ago"}${ctx.topic ? ": " + ctx.topic.replace(/</g, "&lt;") : ""}</div>`;
    const add = (label, cls, fn) => {
      const b = document.createElement("button");
      if (cls) b.className = cls;
      b.textContent = label;
      b.onclick = fn;
      el.appendChild(b);
    };
    const run = (extra) => async (e) => {
      const b = e.currentTarget, label = b.textContent;
      b.disabled = true;
      b.textContent = "Pasting…";
      try {
        await insert((await summaryBlock(ctx)) + extra);
      } catch (err) {
        report("paste", err);
      } finally {
        b.disabled = false;
        b.textContent = label;
      }
    };
    const note = document.createElement("div");
    note.id = "ezw-note";
    note.className = "ezw-note";
    el.appendChild(note);
    add("Paste summary", "ezw-primary", run(""));
    suggestions(ctx).forEach((s) => add(s.label, "", run(s.prompt)));
    ensureFab().querySelector(".ezw-body").appendChild(el);
    layoutDock();
  }

  async function check() {
    if (stopIfOrphaned()) return;
    try {
      ensureFab();
      await checkNow();
    } catch (e) {
      report("panel", e);
    }
  }
  async function checkNow() {
    const [conv, lead] = await Promise.all([send({ type: "latest", host: location.hostname }), send({ type: "leadoff" })]);
    // The lead-off AI is the first one used in this browser session; its tab's icon gets a blue rim.
    const fab = ensureFab();
    const onLead = !!lead && lead.host === location.hostname;
    fab.classList.toggle("ezw-isLead", onLead);
    fab.querySelector(".ezw-orb").title = lead ? `Relay. Lead-off AI this session: ${lead.source}${onLead ? " (this tab)" : ""}` : "Relay";
    const existing = document.getElementById("ezw-panel");
    if (!conv) {
      current = null;
      if (!existing?.dataset.empty) closePanel();
      return;
    }
    const ctx = summarize(conv);
    ctx.isLead = !!lead && lead.host === conv.host;
    current = ctx;
    if (dismissed !== String(ctx.savedAt) && (!existing || existing.dataset.t !== String(ctx.savedAt))) {
      showPanel(ctx);
      document.getElementById("ezw-panel").dataset.t = String(ctx.savedAt);
    }
    await autoPass(ctx);
  }
  poll = setInterval(check, 3000);
  check();

  // When the extension is reloaded or updated, tabs that were already open keep this script
  // running with a dead connection. Notice that and shut down quietly instead of erroring.
  function stopIfOrphaned() {
    if (chrome.runtime?.id) return false;
    clearInterval(poll);
    clearTimeout(timer);
    clearTimeout(judgeTimer);
    for (const ev of ["input", "keyup"]) document.removeEventListener(ev, onTyping, true);
    observer.disconnect();
    document.getElementById("ezw-panel")?.remove();
    document.getElementById("ezw-fab")?.remove();
    return true;
  }
})();
