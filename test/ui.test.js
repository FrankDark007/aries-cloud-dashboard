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
