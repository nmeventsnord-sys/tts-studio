import { env, HttpError } from './http.js'

type Contact = { email: string; name?: string }
type Mail = { to: Contact[]; subject: string; html: string; replyTo?: Contact }

export async function sendMail(m: Mail) {
  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': env('BREVO_API_KEY'), 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      sender: { email: process.env.BREVO_SENDER_EMAIL || 'contact@timetosmile.fr', name: process.env.BREVO_SENDER_NAME || 'Time To Smile Studio' },
      to: m.to,
      subject: m.subject,
      htmlContent: m.html,
      replyTo: m.replyTo,
    }),
  })
  if (!res.ok) {
    console.error('Brevo', res.status, await res.text())
    throw new HttpError(502, "L'email n'a pas pu être envoyé. Réessaie dans un instant.")
  }
}

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

/** Gabarit d'email aux couleurs du Studio. */
export const layout = (title: string, body: string) => `<!doctype html><html><body style="margin:0;background:#F7F5F2;font-family:Poppins,Arial,sans-serif;color:#1a1410">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:28px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e2da">
<tr><td style="background:#0C2830;padding:22px 28px"><div style="font-size:11px;letter-spacing:3px;color:#F2C12E;font-weight:600">TIME TO SMILE · STUDIO</div>
<div style="font-size:20px;color:#fff;font-weight:600;margin-top:6px">${title}</div></td></tr>
<tr><td style="padding:24px 28px;font-size:14px;line-height:1.6">${body}</td></tr></table></td></tr></table></body></html>`
