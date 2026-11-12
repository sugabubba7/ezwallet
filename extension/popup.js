// The toolbar popup: pick baton drop or baton pass. Only this choice is saved (never any chat),
// and the AI pages hear about it through chrome.storage.onChanged (see content.js).
const MODE_KEY = "ezw-mode";
const opts = [...document.querySelectorAll(".opt")];

function show(mode) {
  opts.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === mode)));
}

chrome.storage.local.get(MODE_KEY, (r) => show(r && r[MODE_KEY] === "pass" ? "pass" : "drop"));

opts.forEach((b) =>
  b.addEventListener("click", () => {
    show(b.dataset.mode);
    chrome.storage.local.set({ [MODE_KEY]: b.dataset.mode });
  })
);
