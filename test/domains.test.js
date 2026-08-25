// Staff sign in with a company Google account, so the worker admits by email domain as well
// as by the individual allowlist. Access is the gate that proves who someone is; this is the
// worker's own second check, and it has to admit exactly the same people — no more.

import assert from 'node:assert/strict'
import test from 'node:test'

import worker from '../src/index.js'
import { FakeD1Database } from './fake-d1.js'

const UI_HOST = 'aries.flood.doctor'

function settings(db) {
  return {
    ALLOWED_EMAILS: 'darakhshan.farough@gmail.com',
    ALLOWED_EMAIL_DOMAINS: 'restorationdoctors.com,flood.doctor,flooddoctorva.com',
    PUBLISHER_TOKEN: 'test-publisher-token',
    STALE_AFTER_SECONDS: '300',
    DB: db,
  }
}

function board(email) {
  const headers = email ? { 'Cf-Access-Authenticated-User-Email': email } : {}
  return new Request(`https://${UI_HOST}/api/board`, { headers })
}

test('admits every company domain and the named individual', async () => {
  const env = settings(new FakeD1Database())
  const welcome = [
    'shayan@restorationdoctors.com',
    'katherine@restorationdoctors.com',
    'STEVE@RestorationDoctors.com',
    'mark@flood.doctor',
    'frankd@flooddoctorva.com',
    'darakhshan.farough@gmail.com',
  ]
  for (const email of welcome) {
    const response = await worker.fetch(board(email), env, {})
    assert.equal(response.status, 200, `${email} should be admitted`)
  }
})

test('refuses lookalike domains, subdomains and missing identities', async () => {
  const env = settings(new FakeD1Database())
  const refused = [
    'attacker@notrestorationdoctors.com',
    'attacker@restorationdoctors.com.evil.net',
    'attacker@evil.restorationdoctors.com',
    'attacker@flood.doctor.evil.net',
    'someone@gmail.com',
    'no-domain-at-all',
    '',
  ]
  for (const email of refused) {
    const response = await worker.fetch(board(email), env, {})
    assert.equal(response.status, 403, `${email || '(none)'} must be refused`)
  }
  const anonymous = await worker.fetch(board(null), env, {})
  assert.equal(anonymous.status, 403)
})

test('falls back to the individual allowlist when no domains are configured', async () => {
  const env = settings(new FakeD1Database())
  delete env.ALLOWED_EMAIL_DOMAINS
  const named = await worker.fetch(board('darakhshan.farough@gmail.com'), env, {})
  assert.equal(named.status, 200)
  const staff = await worker.fetch(board('shayan@restorationdoctors.com'), env, {})
  assert.equal(staff.status, 403)
})
