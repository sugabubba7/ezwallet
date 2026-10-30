// Pure detection logic: text in, list of matches out. No DOM, no network, no storage.
// Vendor token shapes are adapted from gitleaks (MIT) and detect-secrets (Apache-2.0).
(function (root) {
  'use strict';

  const MAX_SCAN_CHARS = 50000;
  const DOTS = '••••';

  const maskValue = (s) => s.slice(0, Math.min(4, Math.floor(s.length / 4))) + DOTS;
  const maskEmail = (s) => {
    const at = s.indexOf('@');
    return s[0] + '•••' + s.slice(at);
  };
  const maskPhone = (s) => DOTS + s.slice(-2);

  // A leading "[" also covers our own placeholders (e.g. [OPENAI_KEY]), so covered text is not re-flagged.
  const PLACEHOLDER = /^(?:\[|your[_-]|<|xxx|\*+$|changeme|example|placeholder|\$\{|\$[A-Z])/i;
  const NOT_A_PASSWORD = new Set([
    'your', 'the', 'a', 'an', 'is', 'must', 'should', 'required', 'here', 'empty',
    'hidden', 'enter', 'incorrect', 'wrong', 'invalid', 'too', 'at', 'to', 'and', 'or',
  ]);

  // Order matters: when two matches overlap, the earlier rule wins.
  // `placeholder` is what "cover it up" writes in place of the match (none = can't be covered
  // automatically). With `valueGroup`, only the end of the match (that capture group) is replaced.
  const RULES = [
    { id: 'private-key', label: 'Private key', severity: 'high',
      re: /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/g, mask: () => '-----BEGIN ••••' },
    { id: 'anthropic-key', label: 'Anthropic API key', severity: 'high', placeholder: '[ANTHROPIC_KEY]',
      re: /\bsk-ant-[A-Za-z0-9_-]{20,}/g, mask: maskValue },
    { id: 'openai-key', label: 'OpenAI API key', severity: 'high', placeholder: '[OPENAI_KEY]',
      re: /\bsk-(?!ant-)(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g, mask: maskValue },
    { id: 'github-token', label: 'GitHub token', severity: 'high', placeholder: '[GITHUB_TOKEN]',
      re: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{50,})/g, mask: maskValue },
    { id: 'aws-key', label: 'AWS access key', severity: 'high', placeholder: '[AWS_ACCESS_KEY]',
      re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, mask: maskValue },
    { id: 'google-key', label: 'Google API key', severity: 'high', placeholder: '[GOOGLE_API_KEY]',
      re: /\bAIza[0-9A-Za-z_-]{35}/g, mask: maskValue },
    { id: 'slack-token', label: 'Slack token', severity: 'high', placeholder: '[SLACK_TOKEN]',
      re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/g, mask: maskValue },
    { id: 'stripe-key', label: 'Stripe key', severity: 'high', placeholder: '[STRIPE_KEY]',
      re: /\b[sr]k_(?:live|test)_[A-Za-z0-9]{16,}/g, mask: maskValue },
    { id: 'jwt', label: 'Login token (JWT)', severity: 'high', placeholder: '[JWT]',
      re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, mask: maskValue },
    { id: 'db-url', label: 'Database URL with password', severity: 'high', placeholder: '[DATABASE_URL]',
      re: /\b[a-z][a-z0-9+.-]*:\/\/[^\s:@\/]+:[^\s@\/]+@[^\s]+/gi, mask: (s) => s.split('://')[0] + '://••••' },
    { id: 'env-secret', label: 'Secret in a .env line', severity: 'high',
      re: /^[ \t]*(?:export[ \t]+)?([A-Z][A-Z0-9_]*(?:KEY|SECRET|TOKEN|PASSWORD|PASSWD|PWD)[A-Z0-9_]*)[ \t]*=[ \t]*(\S+)/gm,
      placeholder: (m) => `[${m[1]}]`, valueGroup: 2,
      accept: (m) => {
        const v = m[2].replace(/^["']|["']$/g, '');
        return v.length >= 6 && !PLACEHOLDER.test(v);
      },
      mask: (s, m) => m[1] + '=' + maskValue(m[2].replace(/^["']/, '')) },
    { id: 'password-phrase', label: 'Something that looks like a password', severity: 'medium',
      re: /\b(?:password|passcode|passwd|pwd)[ \t]*(?:is|:|=)[ \t]*["']?([^\s"']{4,})/gi,
      placeholder: '[PASSWORD]', valueGroup: 1,
      accept: (m) => !NOT_A_PASSWORD.has(m[1].toLowerCase()) && !m[1].startsWith('['),
      mask: (s, m) => s.slice(0, s.length - m[1].length) + maskValue(m[1]) },
    { id: 'email', label: 'Email address', severity: 'low', placeholder: '[EMAIL]',
      re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, mask: maskEmail },
    { id: 'phone', label: 'Phone number', severity: 'low', placeholder: '[PHONE]',
      re: /(?<![\w.])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w])/g,
      accept: (m) => { const n = m[0].replace(/\D/g, '').length; return n >= 10 && n <= 13; },
      mask: maskPhone },
  ];

  function scan(text) {
    if (!text) return [];
    const input = text.length > MAX_SCAN_CHARS ? text.slice(0, MAX_SCAN_CHARS) : text;
    const hits = [];
    RULES.forEach((rule, order) => {
      for (const m of input.matchAll(rule.re)) {
        if (rule.accept && !rule.accept(m)) continue;
        const end = m.index + m[0].length;
        let redact = null;
        if (rule.placeholder) {
          redact = {
            start: rule.valueGroup ? end - m[rule.valueGroup].length : m.index,
            end,
            text: typeof rule.placeholder === 'function' ? rule.placeholder(m) : rule.placeholder,
          };
        }
        hits.push({
          id: rule.id, label: rule.label, severity: rule.severity,
          start: m.index, end, order, redact,
          masked: rule.mask(m[0], m),
        });
      }
    });
    hits.sort((a, b) => a.start - b.start || a.order - b.order);
    const kept = [];
    let lastEnd = -1;
    for (const h of hits) {
      if (h.start < lastEnd) continue; // overlaps a match we already kept
      kept.push(h);
      lastEnd = h.end;
    }
    return kept.map(({ order, ...rest }) => rest);
  }

  const api = { scan };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.EZDetect = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
