// One entry per site: where the message box and Send button are.
// These selectors are the part most likely to break when a site changes its page;
// content.js tells the user when it cannot find the message box.
(function (root) {
  'use strict';

  const SITES = [
    {
      name: 'ChatGPT',
      hosts: ['chatgpt.com', 'chat.openai.com'],
      composer: ['#prompt-textarea', 'div.ProseMirror[contenteditable="true"]', 'textarea'],
      send: [
        '[data-testid="send-button"]',
        'button[aria-label="Send prompt" i]',
        'button[aria-label="Send message" i]',
      ],
    },
    {
      name: 'Claude',
      hosts: ['claude.ai'],
      composer: [
        '[data-testid="chat-input"]',
        'div.ProseMirror[contenteditable="true"]',
        'div[contenteditable="true"]',
      ],
      send: ['button[aria-label="Send message" i]', 'button[aria-label="Send" i]'],
    },
  ];

  const forHost = (host) => SITES.find((s) => s.hosts.includes(host)) || null;

  const api = { SITES, forHost };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EZSites = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
