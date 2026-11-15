import { createHmac, timingSafeEqual } from 'node:crypto';

export interface SignedNotification {
  signature?: string;
  requestId?: string;
  paymentId: string;
}

export const isValidSignature = (notification: SignedNotification, secret?: string): boolean => {
  if (!secret) return true;
  const parts = Object.fromEntries(
    (notification.signature ?? '').split(',').map((part) => part.trim().split('=')),
  );
  if (!parts.ts || !parts.v1) return false;

  const manifest = `id:${notification.paymentId.toLowerCase()};request-id:${notification.requestId ?? ''};ts:${parts.ts};`;
  const expected = Buffer.from(createHmac('sha256', secret).update(manifest).digest('hex'));
  const received = Buffer.from(parts.v1);
  return expected.length === received.length && timingSafeEqual(expected, received);
};
