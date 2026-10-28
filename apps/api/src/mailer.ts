import nodemailer, { type Transporter } from 'nodemailer';
import { env } from './env';

export interface MailResult {
  sent: boolean;
  reason?: string;
  /** Provider error message, shown by the admin "test email" button. */
  error?: string;
}

export function mailerConfigured(): boolean {
  return Boolean(env.brevoApiKey) || Boolean(env.resendApiKey) || Boolean(env.smtpHost && env.smtpUser);
}

/** Split `Name <email>` into parts for providers that want them separate. */
function parseFrom(from: string): { name: string; email: string } {
  const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (match) return { name: match[1] || 'IELTS Practice', email: match[2]! };
  return { name: 'IELTS Practice', email: from.trim() };
}

/**
 * Brevo transactional API over HTTPS. Works on hosts that block SMTP ports and
 * only needs a verified sender address (no domain required).
 */
async function sendBrevo(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<MailResult> {
  const sender = parseFrom(env.mailFrom);
  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': env.brevoApiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender,
        to: [{ email: to }],
        subject,
        htmlContent: html,
        textContent: text,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 400);
      console.error(`[mail] Brevo rejected the message (${response.status}): ${body}`);
      return { sent: false, reason: 'api-error', error: body };
    }
    return { sent: true };
  } catch (error) {
    console.error('[mail] Brevo send failed:', (error as Error).message);
    return { sent: false, reason: 'network', error: (error as Error).message };
  }
}

/**
 * Build a link into the SPA. The app uses HashRouter, so the route must come
 * after "#/" for GitHub Pages to serve index.html.
 */
export function appLink(pathWithQuery: string): string {
  const base = env.appUrl.replace(/\/+$/, '');
  return `${base}/#/${pathWithQuery.replace(/^\/+/, '')}`;
}

let smtpTransport: Transporter | null = null;

function getSmtpTransport(): Transporter | null {
  if (!env.smtpHost || !env.smtpUser) return null;
  if (!smtpTransport) {
    smtpTransport = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth: env.smtpPass ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
    });
  }
  return smtpTransport;
}

async function sendSmtp(to: string, subject: string, html: string, text: string): Promise<MailResult> {
  const transport = getSmtpTransport();
  if (!transport) return { sent: false, reason: 'no-smtp' };
  try {
    await transport.sendMail({ from: env.mailFrom, to, subject, html, text });
    return { sent: true };
  } catch (error) {
    const message = (error as Error).message;
    console.error('[mail] SMTP send failed:', message);
    return { sent: false, reason: 'smtp-error', error: message };
  }
}

async function sendResend(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<MailResult> {
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.resendApiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: env.mailFrom, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const body = (await response.text()).slice(0, 300);
      console.error(`[mail] Resend rejected the message (${response.status}): ${body}`);
      return { sent: false, reason: 'api-error', error: body };
    }
    return { sent: true };
  } catch (error) {
    console.error('[mail] send failed:', (error as Error).message);
    return { sent: false, reason: 'network', error: (error as Error).message };
  }
}

/**
 * Delivery order is Brevo → Resend → SMTP → console.
 * HTTPS providers come first because many hosts block outbound SMTP ports.
 */
export async function sendMail(
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<MailResult> {
  if (env.brevoApiKey) {
    return sendBrevo(to, subject, html, text);
  }
  if (env.resendApiKey) {
    return sendResend(to, subject, html, text);
  }
  if (env.smtpHost && env.smtpUser) {
    return sendSmtp(to, subject, html, text);
  }

  console.log(
    `[mail] no provider configured — would send to ${to}\n[mail] subject: ${subject}\n[mail] body:\n${text}`,
  );
  return { sent: false, reason: 'no-provider' };
}

function layout(title: string, body: string, footer: string): string {
  return `<!doctype html>
<html><body style="margin:0;background:#f8fafc;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#0f172a">
  <div style="max-width:520px;margin:32px auto;background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:28px">
    <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#4f46e5">IELTS Practice</p>
    <h1 style="margin:0 0 16px;font-size:20px">${title}</h1>
    ${body}
    <p style="margin:24px 0 0;font-size:12px;color:#94a3b8">${footer}</p>
  </div>
</body></html>`;
}

export function verifyEmailMail(link: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Verify your email — IELTS Practice',
    html: layout(
      'Confirm your email address',
      `<p style="font-size:14px;line-height:1.6">Click the button below to confirm this address. The link expires in 24 hours.</p>
       <p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">Verify email</a></p>
       <p style="font-size:12px;color:#64748b;word-break:break-all">${link}</p>`,
      'If you did not create an account, you can ignore this email.',
    ),
    text: `Verify your email for IELTS Practice:\n${link}\n\nThis link expires in 24 hours. If you did not create an account, ignore this email.`,
  };
}

export function resetPasswordMail(link: string): { subject: string; html: string; text: string } {
  return {
    subject: 'Reset your password — IELTS Practice',
    html: layout(
      'Reset your password',
      `<p style="font-size:14px;line-height:1.6">Use the button below to choose a new password. The link expires in 1 hour and can only be used once.</p>
       <p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">Choose a new password</a></p>
       <p style="font-size:12px;color:#64748b;word-break:break-all">${link}</p>`,
      'If you did not request a reset, no action is needed — your password has not changed.',
    ),
    text: `Reset your IELTS Practice password:\n${link}\n\nThis link expires in 1 hour. If you did not request it, ignore this email.`,
  };
}
