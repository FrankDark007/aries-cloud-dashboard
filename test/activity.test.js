import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const OWNER = 'darakhshan.farough@gmail.com'

function env() {
  return {
    ALLOWED_EMAILS: OWNER,
    ALLOWED_EMAIL_DOMAINS: 'flood.doctor',
    ACTIVITY_OWNER_EMAILS: OWNER,
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: new FakeD1Database(),
  }
}

function as(email, path, init = {}) {
  return new Request(`https://${UI_HOST}${path}`, {
    ...init,
    headers: { 'Cf-Access-Authenticated-User-Email': email, ...(init.headers || {}) },
  })
}

function action(email, body) {
  return as(email, '/api/action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'CF-Connecting-IP': '203.0.113.9',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15',
    },
    body: JSON.stringify(body),
  })
}

test('the activity log is served to the owner and is a 404 for every other identity', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()

  for (const path of ['/activity', '/api/activity']) {
    const owner = await worker.fetch(as(OWNER, path), settings, {})
    assert.equal(owner.status, 200, path)
    const ownerCase = await worker.fetch(as('Darakhshan.Farough@gmail.com', path), settings, {})
    assert.equal(ownerCase.status, 404, 'Access sends the exact address; a different casing is not on ALLOWED_EMAILS')

    for (const email of ['mark@flood.doctor', 'dom@flood.doctor', 'outsider@example.com', '']) {
      const response = await worker.fetch(as(email, path), settings, {})
      assert.equal(response.status, 404, `${email || 'anonymous'} ${path}`)
    }
  }
  const post = await worker.fetch(as(OWNER, '/api/activity', { method: 'POST' }), settings, {})
  assert.equal(post.status, 405)
})

test('every board action records who, what, card title, IP, country and device', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()
  settings.DB.seedSnapshot([{ id: 41, title: 'Review carrier estimate' }], new Date().toISOString())

  const request = action('mark@flood.doctor', { id: 41, operation: 'done' })
  Object.defineProperty(request, 'cf', { value: { country: 'US' } })
  const response = await worker.fetch(request, settings, {})
  assert.equal(response.status, 202)
  assert.equal(settings.DB.commands.length, 1)

  const [row] = settings.DB.activity
  assert.equal(row.actor_email, 'mark@flood.doctor')
  assert.equal(row.operation, 'done')
  assert.equal(row.item_id, '41')
  assert.equal(row.title, 'Review carrier estimate')
  assert.equal(row.ip, '203.0.113.9')
  assert.equal(row.country, 'US')
  assert.match(row.user_agent, /Safari/)

  const log = await (await worker.fetch(as(OWNER, '/api/activity'), settings, {})).json()
  assert.equal(log.rows.length, 1)
  assert.equal(log.rows[0].ip, '203.0.113.9')

  const page = await (await worker.fetch(as(OWNER, '/activity'), settings, {})).text()
  assert.match(page, /Review carrier estimate/)
  assert.match(page, /203\.0\.113\.9/)
})

test('a burst of closes by one person is flagged in the 24-hour summary', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()
  for (let id = 1; id <= 25; id += 1) {
    const response = await worker.fetch(action('mark@flood.doctor', { id, operation: 'done' }), settings, {})
    assert.equal(response.status, 202)
  }
  await worker.fetch(action('dom@flood.doctor', { id: 99, operation: 'done' }), settings, {})

  const log = await (await worker.fetch(as(OWNER, '/api/activity?who=mark@flood.doctor&op=done'), settings, {})).json()
  assert.equal(log.rows.length, 25)
  const mark = log.summary.find((entry) => entry.who === 'mark@flood.doctor' && entry.op === 'done')
  assert.equal(mark.count, 25)
  assert.equal(mark.burst.count, 25)
  const dom = log.summary.find((entry) => entry.who === 'dom@flood.doctor')
  assert.equal(dom.burst, null)
})

test('only the owner is told to show the Activity link', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()
  settings.DB.seedSnapshot([], new Date().toISOString())
  const owner = await (await worker.fetch(as(OWNER, '/api/board'), settings, {})).json()
  assert.equal(owner.activity, true)
  const mark = await (await worker.fetch(as('mark@flood.doctor', '/api/board'), settings, {})).json()
  assert.equal(mark.activity, false)
})
