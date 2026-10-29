import { Resend } from 'resend';
import { assertPreviewReadOnly, previewLibraryBlocked } from '@/lib/preview-readonly';

let _client: Resend | null = null;

function guardResend(client: Resend): Resend {
  if (!previewLibraryBlocked()) return client;
  return new Proxy(client, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (prop === 'emails' && value && typeof value === 'object') {
        return new Proxy(value as object, {
          get(emailTarget, emailProp, emailReceiver) {
            if (emailProp === 'send') {
              return async () => {
                assertPreviewReadOnly('resend');
              };
            }
            const inner = Reflect.get(emailTarget, emailProp, emailReceiver);
            return typeof inner === 'function' ? (inner as (...args: unknown[]) => unknown).bind(emailTarget) : inner;
          },
        });
      }
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value;
    },
  }) as Resend;
}

export function getResend(): Resend {
  if (!_client) {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY is not configured');
    }
    _client = new Resend(key);
  }
  return guardResend(_client);
}

export const EMAIL_FROM = process.env.EMAIL_FROM || 'Elevare Careers <orders@elevarecareer.com>';
export const EMAIL_BCC = process.env.EMAIL_BCC || 'hello@elevarecareer.com';
