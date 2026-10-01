import { NextResponse } from 'next/server';
import { apiResponse } from '@/lib/api-response';
import { getSession } from '@/lib/auth/server';
import { PaymentError } from '@/lib/paibao-pay/core';
import { checkoutPlan } from '@/lib/paibao-pay/service';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session?.user) return apiResponse.unauthorized();
  let body: unknown;
  try { body = await req.json(); }
  catch { return apiResponse.badRequest('Invalid checkout request.'); }
  if (!body || typeof body !== 'object' || !('planId' in body) || typeof body.planId !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.planId)) {
    return apiResponse.badRequest('Please choose a plan.');
  }
  try {
    return apiResponse.success(await checkoutPlan(session.user.id, session.user.email, body.planId));
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json({ success: false, error: error.message, data: { orderId: error.orderId } }, { status: error.status });
    }
    console.error('Payment checkout failed', { code: 'unexpected_failure' });
    return apiResponse.serverError('Payment is temporarily unavailable.');
  }
}
