'use client';

import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/routing';
import { useLocale } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';

type OrderView = { status: string; planName: string; amount: string; currency: string; checkoutUrl?: string };

function OrderStatus() {
  const params = useSearchParams();
  const orderId = params.get('order_id');
  const locale = useLocale();
  const [order, setOrder] = useState<OrderView>();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const text = locale === 'zh' ? {
    title: '付款状态', checking: '正在核实付款', success: '付款已确认，终身版已生效。',
    pending: '付款尚未确认。若已付款，请稍后再次查询。', expired: '收银台已过期，请返回定价页重试。',
    failed: '暂时无法确认付款。请先登录，然后再次查询。', check: '再次查询',
    checkout: '打开收银台', dashboard: '查看我的车辆', pricing: '返回定价页', login: '登录',
  } : locale === 'ja' ? {
    title: 'お支払い状況', checking: 'お支払いを確認しています', success: 'お支払いを確認しました。Lifetime が有効です。',
    pending: 'お支払いはまだ確認できていません。支払い済みの場合は再度ご確認ください。', expired: '決済ページの有効期限が切れました。料金ページから再度お試しください。',
    failed: 'お支払いを確認できません。ログインして再度ご確認ください。', check: '再確認',
    checkout: '決済ページを開く', dashboard: 'マイカーを見る', pricing: '料金ページに戻る', login: 'ログイン',
  } : {
    title: 'Payment status', checking: 'Checking your payment', success: 'Payment confirmed. Your Lifetime plan is active.',
    pending: 'Payment has not been confirmed yet. If you have paid, check again shortly.', expired: 'This checkout has expired. Return to pricing to try again.',
    failed: 'Payment could not be confirmed. Please log in and check again.', check: 'Check again',
    checkout: 'Open checkout', dashboard: 'View my vehicles', pricing: 'Back to pricing', login: 'Log in',
  };
  const check = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setFailed(false);
    try {
      if (!orderId) throw new Error('Missing order');
      const response = await fetch(`/api/payment/paibao/orders/${encodeURIComponent(orderId)}`, { cache: 'no-store', signal });
      const result = await response.json();
      if (!response.ok || !result.success || !['pending', 'succeeded', 'expired'].includes(result.data?.status)) throw new Error('Unconfirmed order');
      setOrder(result.data);
    } catch (error) {
      if (signal?.aborted) return;
      console.error('Payment status could not be confirmed', { aborted: error instanceof Error && error.name === 'AbortError' });
      setOrder(undefined);
      setFailed(true);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [orderId]);
  useEffect(() => {
    const controller = new AbortController();
    void check(controller.signal);
    return () => controller.abort();
  }, [check]);
  const message = loading ? text.checking : failed ? text.failed : order?.status === 'succeeded' ? text.success : order?.status === 'expired' ? text.expired : text.pending;
  return (
    <main className="container max-w-xl mx-auto py-16 space-y-6">
      <h1 className="text-3xl font-bold">{text.title}</h1>
      <p role="status" aria-live="polite">{message}</p>
      {order && <p>{order.planName} · {order.currency} {order.amount}</p>}
      <div className="flex flex-wrap gap-3">
        {order?.status !== 'succeeded' && <Button onClick={() => void check()} disabled={loading}>{text.check}</Button>}
        {order?.status === 'pending' && order.checkoutUrl && <Button asChild variant="outline"><a href={order.checkoutUrl} target="_blank" rel="noopener noreferrer nofollow">{text.checkout}</a></Button>}
        {order?.status === 'succeeded' && <Button asChild><Link href="/dashboard/movecar">{text.dashboard}</Link></Button>}
        {failed && <Button asChild variant="outline"><Link href="/login">{text.login}</Link></Button>}
        <Button asChild variant="outline"><Link href="/pricing">{text.pricing}</Link></Button>
      </div>
    </main>
  );
}

export default function PaymentOrderPage() {
  return <Suspense><OrderStatus /></Suspense>;
}
