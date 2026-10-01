import { NextResponse } from 'next/server';
import { fulfillSecret } from '@/lib/paibao-pay/config';
import { parseFulfillment, PaymentError, verifySignature } from '@/lib/paibao-pay/core';
import { fulfillPayment } from '@/lib/paibao-pay/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const raw = new Uint8Array(await req.arrayBuffer());
    if (!verifySignature(raw, req.headers.get('X-Paibao-Signature'), fulfillSecret())) {
      return NextResponse.json({ success: false, error: 'Invalid signature.' }, { status: 401 });
    }
    const payload = parseFulfillment(raw);
    const result = await fulfillPayment(payload);
    return NextResponse.json({ success: true, result });
  } catch (error) {
    if (error instanceof PaymentError) {
      console.error('Payment delivery rejected', { code: error.code, orderId: error.orderId });
      return NextResponse.json({ success: false, error: error.message }, { status: error.status });
    }
    console.error('Payment delivery failed', { code: 'unexpected_failure' });
    return NextResponse.json({ success: false, error: 'Payment confirmation is temporarily unavailable.' }, { status: 503 });
  }
}
