import { apiResponse } from '@/lib/api-response';
import { getSession } from '@/lib/auth/server';
import { PaymentError } from '@/lib/paibao-pay/core';
import { getPaymentOrder } from '@/lib/paibao-pay/service';

export const runtime = 'nodejs';

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session?.user) return apiResponse.unauthorized();
  const { id } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return apiResponse.notFound('Order not found.');
  }
  try {
    return apiResponse.success(await getPaymentOrder(session.user.id, id));
  } catch (error) {
    if (error instanceof PaymentError) return apiResponse.error(error.message, error.status);
    console.error('Payment status failed', { code: 'unexpected_failure' });
    return apiResponse.serverError('Payment confirmation is temporarily unavailable.');
  }
}
