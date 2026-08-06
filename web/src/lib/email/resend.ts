import { Resend } from 'resend';

// Lazy singleton: constructing Resend() with no key throws, and this module
// is imported by API routes that must still boot (and serve everything else)
// on a machine that hasn't set RESEND_API_KEY yet — e.g. local dev.
let client: Resend | null = null;
function getClient(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!client) client = new Resend(key);
  return client;
}

const FROM = process.env.RESEND_FROM_EMAIL || 'CryptoLend <receipts@cryptolend.dev>';

/**
 * Fire-and-forget email send. Never throws — a receipt email failing must
 * never fail (or even slow down) the API route that just recorded a
 * confirmed on-chain transaction. Logs on failure so it's diagnosable.
 */
export function sendEmail(to: string, subject: string, html: string): void {
  const resend = getClient();
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping send to', to);
    return;
  }
  resend.emails.send({ from: FROM, to, subject, html }).catch(err => {
    console.error('[email] send failed:', err);
  });
}
