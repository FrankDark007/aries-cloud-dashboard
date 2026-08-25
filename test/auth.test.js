import assert from 'node:assert/strict'
import test from 'node:test'

import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'
const SYNC_HOST = 'aries-publish.flood.doctor'

function request(host, path = '/', init = {}) {
  return new Request(`https://${host}${path}`, init)
}

function env(overrides = {}) {
  return {
    ALLOWED_EMAILS: 'dom@flood.doctor,mark@flood.doctor',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: new FakeD1Database(),
    ...overrides,
  }
}

test('serves only a minimal public health response on the two configured hosts', async () => {
  const { default: worker } = await import('../src/index.js')

  for (const host of [UI_HOST, SYNC_HOST]) {
    const response = await worker.fetch(request(host, '/healthz'), env(), {})
    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), { ok: true })
    assert.equal(response.headers.get('cache-control'), 'no-store')
  }

  const foreign = await worker.fetch(request('attacker.example', '/healthz'), env(), {})
  assert.equal(foreign.status, 404)
  assert.equal(await foreign.text(), 'Not found')
})

test('fails closed on UI identity and sync bearer authentication', async () => {
  const { default: worker } = await import('../src/index.js')
  const settings = env()

  const missingIdentity = await worker.fetch(request(UI_HOST), settings, {})
  assert.equal(missingIdentity.status, 403)

  const unlistedIdentity = await worker.fetch(request(UI_HOST, '/', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'outsider@flood.doctor' },
  }), settings, {})
  assert.equal(unlistedIdentity.status, 403)

  const wrongCaseIdentity = await worker.fetch(request(UI_HOST, '/', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'Dom@flood.doctor' },
  }), settings, {})
  assert.equal(wrongCaseIdentity.status, 403)

  const teammate = await worker.fetch(request(UI_HOST, '/', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor' },
  }), settings, {})
  assert.notEqual(teammate.status, 403)

  const missingBearer = await worker.fetch(request(SYNC_HOST, '/api/sync/commands'), settings, {})
  assert.equal(missingBearer.status, 401)

  const accessHeaderCannotReplaceBearer = await worker.fetch(request(SYNC_HOST, '/api/sync/commands', {
    headers: { 'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor' },
  }), settings, {})
  assert.equal(accessHeaderCannotReplaceBearer.status, 401)

  const validBearer = await worker.fetch(request(SYNC_HOST, '/api/sync/commands', {
    headers: { authorization: 'Bearer test-publisher-token' },
  }), settings, {})
  assert.notEqual(validBearer.status, 401)

  const crossHost = await worker.fetch(request(UI_HOST, '/api/sync/commands', {
    headers: {
      authorization: 'Bearer test-publisher-token',
      'Cf-Access-Authenticated-User-Email': 'dom@flood.doctor',
    },
  }), settings, {})
  assert.equal(crossHost.status, 404)
})
