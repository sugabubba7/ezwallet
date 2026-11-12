// Relay context handoff (prototype).
// Records the live chat on the page into chrome.storage.session (via the background worker),
// so it survives a reload and is erased when the browser closes, and offers it on a
// different AI site. Nothing leaves the browser.
(() => {
  const MAX_MSGS = 8; // how many recent messages go into a pasted context block
  const MAX_CHARS = 1200;

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
      const body = (await modelSummary(ctx.conv)) || heuristicSummary(ctx.conv);
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

  function insert(text) {
    const box = site.input();
    if (!box) return alert("Relay: couldn't find the chat box on this page.");
    box.focus();
    document.execCommand("insertText", false, text);
  }

  // ---- UI ----
  function showPanel(ctx) {
    document.getElementById("ezw-panel")?.remove();
    const mins = Math.max(0, Math.round((Date.now() - ctx.savedAt) / 60000));
    const el = document.createElement("div");
    el.id = "ezw-panel";
    el.innerHTML = `<div class="ezw-head"><span class="ezw-title"><img class="ezw-logo" alt="" src="${chrome.runtime.getURL("icons/wallet-dark-48.png")}">Relay</span><button class="ezw-x" title="Dismiss">✕</button></div>
      <div class="ezw-sub">From ${ctx.source}, ${mins === 0 ? "just now" : mins + " min ago"}${ctx.topic ? ": " + ctx.topic.replace(/</g, "&lt;") : ""}</div>`;
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
      b.textContent = "Summarizing…";
      try {
        insert((await summaryBlock(ctx)) + extra);
      } catch (err) {
        report("paste", err);
      } finally {
        b.disabled = false;
        b.textContent = label;
      }
    };
    add("Paste summary", "ezw-primary", run(""));
    suggestions(ctx).forEach((s) => add(s.label, "", run(s.prompt)));
    el.querySelector(".ezw-x").onclick = () => el.remove();
    document.body.appendChild(el);
  }

  async function check() {
    if (stopIfOrphaned()) return;
    try {
      await checkNow();
    } catch (e) {
      report("panel", e);
    }
  }
  async function checkNow() {
    const conv = await send({ type: "latest", host: location.hostname });
    const existing = document.getElementById("ezw-panel");
    if (!conv) {
      existing?.remove();
      return;
    }
    const ctx = summarize(conv);
    if (!existing || existing.dataset.t !== String(ctx.savedAt)) {
      showPanel(ctx);
      document.getElementById("ezw-panel").dataset.t = String(ctx.savedAt);
    }
  }
  poll = setInterval(check, 3000);
  check();

  // When the extension is reloaded or updated, tabs that were already open keep this script
  // running with a dead connection. Notice that and shut down quietly instead of erroring.
  function stopIfOrphaned() {
    if (chrome.runtime?.id) return false;
    clearInterval(poll);
    clearTimeout(timer);
    observer.disconnect();
    document.getElementById("ezw-panel")?.remove();
    return true;
  }
})();
