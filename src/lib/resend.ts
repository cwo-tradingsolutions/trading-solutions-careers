import { Resend } from 'resend';
import { ATS_FROM_EMAIL, ATS_FROM_NAME } from '@/lib/ats-from';

let _client: Resend | null = null;

export function getResend(): Resend {
  if (_client) return _client;
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  _client = new Resend(key);
  return _client;
}

export const EMAIL_FROM = process.env.EMAIL_FROM || `${ATS_FROM_NAME} <${ATS_FROM_EMAIL}>`;
