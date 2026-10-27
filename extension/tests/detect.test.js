const test = require('node:test');
const assert = require('node:assert');
const { scan } = require('../detect.js');

const ids = (t) => scan(t).map((h) => h.id);
const fake = (prefix, n, ch = 'a') => prefix + ch.repeat(n);

test('vendor keys', () => {
  assert.deepStrictEqual(ids('key ' + fake('sk-proj-', 30)), ['openai-key']);
  assert.deepStrictEqual(ids(fake('sk-ant-', 30)), ['anthropic-key']);
  assert.deepStrictEqual(ids(fake('ghp_', 36)), ['github-token']);
  assert.deepStrictEqual(ids('AKIA' + 'A'.repeat(16)), ['aws-key']);
  assert.deepStrictEqual(ids(fake('sk_live_', 24)), ['stripe-key']);
  assert.deepStrictEqual(ids('-----BEGIN RSA PRIVATE KEY-----'), ['private-key']);
});

test('.env lines', () => {
  assert.deepStrictEqual(ids('DB_PASSWORD=hunter2hunter2'), ['env-secret']);
  assert.deepStrictEqual(ids('export STRIPE_SECRET="abcdef123456"'), ['env-secret']);
  assert.deepStrictEqual(ids('API_KEY=your_api_key_here'), []);
  assert.deepStrictEqual(ids('NODE_ENV=production'), []);
});

test('db url with password', () => {
  assert.deepStrictEqual(ids('postgres://user:pa55word@host:5432/db'), ['db-url']);
  assert.deepStrictEqual(ids('https://example.com/path'), []);
});

test('password phrase', () => {
  assert.deepStrictEqual(ids('my password is purplebanana'), ['password-phrase']);
  assert.deepStrictEqual(ids('Password: Enter your name'), []);
});

test('email and phone', () => {
  assert.deepStrictEqual(ids('mail me at jane.doe@example.com'), ['email']);
  assert.deepStrictEqual(ids('call (212) 555-0147'), ['phone']);
  assert.deepStrictEqual(ids('call +1 212-555-0147'), ['phone']);
  assert.deepStrictEqual(ids('the date is 2026-10-26'), []);
  assert.deepStrictEqual(ids('order 12345'), []);
});

test('plain text is clean', () => {
  assert.deepStrictEqual(ids('How do I sort a list in Python? Explain simply.'), []);
});

test('masked values never contain the full secret', () => {
  const secret = fake('sk-proj-', 30);
  const [hit] = scan(secret);
  assert.ok(!hit.masked.includes(secret));
  assert.ok(hit.masked.length < 12);
  const [mail] = scan('jane.doe@example.com');
  assert.strictEqual(mail.masked, 'j•••@example.com');
});

test('overlaps keep one match', () => {
  assert.strictEqual(scan('postgres://u:p4ssw0rd@db.example.com/x').length, 1);
});

// Mirrors content.js coverUp() on a plain string: replace one coverable match at a time.
function cover(text) {
  for (let i = 0; i < 50; i++) {
    const hit = scan(text).find((h) => h.severity !== 'low' && h.redact);
    if (!hit) break;
    text = text.slice(0, hit.redact.start) + hit.redact.text + text.slice(hit.redact.end);
  }
  return text;
}

test('cover-up replaces secrets with placeholders and leaves nothing loud behind', () => {
  const input = [
    'DB_PASSWORD=hunter2hunter2',
    'OPENAI_API_KEY=' + fake('sk-proj-', 30),
    'url postgres://admin:pa55word@db.example.com:5432/app',
    'my password is purplebanana',
    'AWS AKIA' + 'A'.repeat(16),
  ].join('\n');
  const out = cover(input);
  assert.strictEqual(out, [
    'DB_PASSWORD=[DB_PASSWORD]',
    'OPENAI_API_KEY=[OPENAI_API_KEY]',
    'url [DATABASE_URL]',
    'my password is [PASSWORD]',
    'AWS [AWS_ACCESS_KEY]',
  ].join('\n'));
  assert.deepStrictEqual(scan(out).filter((h) => h.severity !== 'low'), []);
});

test('quoted env values and bare keys', () => {
  assert.strictEqual(cover('export STRIPE_SECRET="abcdef123456"'), 'export STRIPE_SECRET=[STRIPE_SECRET]');
  assert.strictEqual(cover('use ' + fake('sk-ant-', 30) + ' please'), 'use [ANTHROPIC_KEY] please');
});

test('private keys cannot be covered automatically', () => {
  const [hit] = scan('-----BEGIN RSA PRIVATE KEY-----');
  assert.strictEqual(hit.redact, null);
});
