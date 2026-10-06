import { expect, test } from '@playwright/test'

import { BREVO_SMTP_HOST, deliver, emailEnabled, senderAddress, smtpHost } from '../lib/notifications/mailer'

test('Brevo is the default relay once credentials exist, and sending is off without them', () => {
  expect(smtpHost({})).toBeUndefined()
  expect(emailEnabled({})).toBe(false)
  expect(smtpHost({ SMTP_USER: 'a@b.c' })).toBe(BREVO_SMTP_HOST)
  expect(BREVO_SMTP_HOST).toBe('smtp-relay.brevo.com')
  expect(emailEnabled({ SMTP_USER: 'a@b.c' })).toBe(true)
  expect(smtpHost({ SMTP_USER: 'a@b.c', SMTP_HOST: 'smtp.example.org' })).toBe('smtp.example.org')
  expect(emailEnabled({ SMTP_USER: 'a@b.c', EMAIL_DRY_RUN: '1' })).toBe(false)
})

test('the sender comes from SMTP_FROM, then EMAIL_FROM, then the default', () => {
  expect(senderAddress({ SMTP_FROM: 'A <a@x.tn>', EMAIL_FROM: 'B <b@x.tn>' })).toBe('A <a@x.tn>')
  expect(senderAddress({ EMAIL_FROM: 'B <b@x.tn>' })).toBe('B <b@x.tn>')
  expect(senderAddress({})).toBe('ShiftGrid <noreply@shiftgrid.tn>')
})

test('a provider failure is returned, never thrown', async () => {
  const saved = { ...process.env }
  // Nothing listens on this port: a connection error, which must come back as `failed`.
  Object.assign(process.env, { SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', SMTP_USER: 'u', SMTP_PASS: 'p', TELEMETRY_DISABLED: '1' })
  delete process.env.EMAIL_DRY_RUN
  try {
    const result = await deliver({ to: 'player@example.org', subject: 's', html: '<p>x</p>' })
    expect(result.status).toBe('failed')
    expect(result.error).toBeTruthy()
  } finally {
    process.env = saved
  }
})
