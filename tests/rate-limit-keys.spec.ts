import { test, expect } from '@playwright/test'

import { clientIpFrom } from '../lib/rate-limit'

const headers = (h: Record<string, string>) => new Headers(h)

test.describe('clientIpFrom trusts only proxy-set headers', () => {
  test.afterEach(() => {
    delete process.env.VERCEL
  })

  test('on Vercel the platform header wins over a forged x-forwarded-for', () => {
    process.env.VERCEL = '1'
    expect(clientIpFrom(headers({ 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '1.1.1.1, 203.0.113.7' }))).toBe('203.0.113.7')
    expect(clientIpFrom(headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2')
  })

  test('elsewhere the client-controlled first x-forwarded-for hop is ignored', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '6.6.6.6, 10.0.0.9' }))).toBe('10.0.0.9')
    expect(clientIpFrom(headers({ 'x-forwarded-for': '6.6.6.6', 'x-real-ip': '10.0.0.5' }))).toBe('10.0.0.5')
    expect(clientIpFrom(headers({}))).toBe('unknown')
  })
})
