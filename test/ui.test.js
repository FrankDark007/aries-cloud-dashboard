import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const env = {
  ALLOWED_EMAILS: 'dom@flood.doctor,mark@flood.doctor',
  PUBLISHER_TOKEN: 'test-publisher-token',
  STALE_AFTER_SECONDS: '300',
  DB: new FakeD1Database(),
}

function ui(headers = {}) {
  return new Request('https://aries.flood.doctor/', { headers })
}

test('serves the employee-safe interactive board only to an authenticated teammate', async () => {
  const unauthorized = await worker.fetch(ui(), env, {})
  assert.equal(unauthorized.status, 403)

  const response = await worker.fetch(ui({
    'Cf-Access-Authenticated-User-Email': 'mark@flood.doctor',
  }), env, {})
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /^text\/html/)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.match(response.headers.get('content-security-policy'), /default-src 'none'/)

  const html = await response.text()
  assert.match(html, /<h1[^>]*>\s*Aries\s*<\/h1>/)
  assert.match(html, /Operations board/)
  assert.match(html, />Board<\/button>/)
  assert.match(html, />To-Do<\/button>/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /data-action="done"/)
  assert.match(html, /data-action="note"/)
  assert.match(html, /\/api\/board/)
  assert.match(html, /\/api\/action/)
  assert.match(html, /\/api\/todos/)
  assert.match(html, /\/api\/todo\/action/)
  for (const forbidden of ['gmail', 'knowledge', 'memory', 'raw state', '>Draft<', '>Ask<']) {
    assert.equal(html.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden)
  }

  const syncHost = await worker.fetch(new Request('https://aries-publish.flood.doctor/', {
    headers: { authorization: 'Bearer test-publisher-token' },
  }), env, {})
  assert.equal(syncHost.status, 404)
})

// The whole page is authored inside ONE JavaScript template literal, which means an escape
// sequence written with a single backslash is resolved when the module loads, not when the
// browser parses the page. A `\n` inside an inline-script string therefore arrives as a REAL
// newline, leaves that string unterminated, and takes down every script on the page — the
// board renders completely blank, and nothing on the server side looks wrong at all. That has
// now happened twice, so it gets a test rather than a comment.
test('the served page parses as JavaScript, so a stray escape cannot blank the board', async () => {
  const response = await worker.fetch(ui({ 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor' }), env, {})
  assert.equal(response.status, 200)
  const html = await response.text()

  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.ok(scripts.length > 0, 'the page should carry its behaviour inline')
  for (const source of scripts) {
    // A syntax error anywhere in the module is what produces the blank page; constructing the
    // function is enough to surface it without running any of it.
    assert.doesNotThrow(() => new Function(source), 'inline script must parse')
  }

  // Belt: no single-quoted string may span a line break. new Function() catches the fatal case,
  // but this names the actual mistake if a future one slips through in a spot that still parses.
  for (const source of scripts) {
    const lines = source.split('\n')
    for (const [index, line] of lines.entries()) {
      if (line.trim().startsWith('//')) continue   // prose may contain an apostrophe
      const singles = (line.match(/(?<!\\)'/g) || []).length
      assert.equal(singles % 2, 0,
        `unbalanced quote at inline script line ${index + 1}: ${line.trim().slice(0, 90)}`)
    }
  }
})
