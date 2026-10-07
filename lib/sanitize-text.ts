/**
 * Plain-text sanitising for free-text inputs (names, notes, addresses, bios).
 * Used as a Zod `.transform(stripHtml)` AFTER the length checks, so what the server stores and emails
 * never contains markup. Output encoding (React escaping, `escapeHtml` in email templates) stays the
 * real XSS defence; this removes the payload as well.
 */
export function stripHtml(input: string): string {
  return input
    .replace(/<(script|style)\b[^>]*>[\s\S]*?(<\/\1\s*>|$)/gi, '') // whole script/style blocks, even unterminated
    .replace(/<!--[\s\S]*?(-->|$)/g, '')
    .replace(/<\/?[a-z!?][^>]*>?/gi, '') // tags (also a dangling "<img onerror=...")
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '') // control characters (keeps \t \n \r)
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}
