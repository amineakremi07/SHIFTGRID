import { expect, test } from '@playwright/test'

import { INTERNAL_STORAGE_KEY, isInternalEnvironment, shouldRegisterInternal } from '../lib/internal-user'

const store = (v: string | null) => ({ getItem: (k: string) => (k === INTERNAL_STORAGE_KEY ? v : null) })

test('localhost and development builds are internal', () => {
  expect(isInternalEnvironment({ hostname: 'localhost' })).toBe(true)
  expect(isInternalEnvironment({ hostname: '127.0.0.1' })).toBe(true)
  expect(isInternalEnvironment({ hostname: 'app.localhost' })).toBe(true)
  expect(isInternalEnvironment({ hostname: 'shiftgridtn.vercel.app', appEnv: 'development' })).toBe(true)
  expect(isInternalEnvironment({ hostname: 'shiftgridtn.vercel.app', nodeEnv: 'development' })).toBe(true)
})

test('production visitors are not internal unless a team member opted in', () => {
  const base = { hostname: 'shiftgridtn.vercel.app', appEnv: 'production', nodeEnv: 'production' }
  expect(isInternalEnvironment(base)).toBe(false)
  expect(isInternalEnvironment({ hostname: 'localhost.evil.com', nodeEnv: 'production' })).toBe(false)
  expect(shouldRegisterInternal({ ...base, storage: store(null) })).toBe(false)
  expect(shouldRegisterInternal({ ...base, storage: null })).toBe(false)
  expect(shouldRegisterInternal({ ...base, storage: store('1') })).toBe(true)
  expect(shouldRegisterInternal({ ...base, storage: store('0') })).toBe(false)
})
