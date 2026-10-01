"use client";

import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/routing";
import { pricingPlans as pricingPlansSchema } from "@/lib/db/schema";
import { Loader2, MousePointerClick } from "lucide-react";
import { useLocale } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";

type PricingPlan = typeof pricingPlansSchema.$inferSelect;
type Params = { plan: PricingPlan; localizedPlan: { buttonText?: string } };

export default function PricingCTA({ plan, localizedPlan }: Params) {
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutUrl, setCheckoutUrl] = useState<string>();
  const [orderId, setOrderId] = useState<string>();
  const router = useRouter();
  const locale = useLocale();
  const recurring = plan.paymentType === "recurring";
  const free = plan.provider === "none" && Number(plan.price) === 0;
  const text = locale === "zh" ? {
    unavailable: "订阅暂未开放，可选择终身版。", login: "请先登录再购买。",
    failed: "暂时无法确认收款，请查看订单状态。", open: "打开收银台", check: "查看付款状态",
  } : locale === "ja" ? {
    unavailable: "定期購入は準備中です。Lifetime を選択できます。", login: "購入前にログインしてください。",
    failed: "お支払いを確認できません。注文状況をご確認ください。", open: "決済ページを開く", check: "支払い状況を確認",
  } : {
    unavailable: "Subscriptions are temporarily unavailable. Please choose Lifetime.", login: "Please log in to purchase a plan.",
    failed: "Checkout could not be confirmed. Please check your order.", open: "Open checkout", check: "Check payment status",
  };

  const handleCheckout = async () => {
    if (free) { router.push("/dashboard/movecar/tags/new"); return; }
    if (recurring) return;
    setCheckoutUrl(undefined);
    setOrderId(undefined);
    setIsLoading(true);
    try {
      const response = await fetch("/api/payment/checkout-session", {
        method: "POST", headers: { "Content-Type": "application/json", "Accept-Language": locale },
        body: JSON.stringify({ planId: plan.id }),
      });
      const result = await response.json();
      if (typeof result.data?.orderId === "string") setOrderId(result.data.orderId);
      if (response.status === 401) { router.push("/login"); toast.error(text.login); return; }
      if (!response.ok || !result.success || typeof result.data?.checkoutUrl !== "string") {
        throw new Error(text.failed);
      }
      const url = new URL(result.data.checkoutUrl);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error(text.failed);
      setCheckoutUrl(url.href);
      window.open(url.href, "_blank", "noopener,noreferrer");
    } catch {
      console.error("Checkout could not be confirmed");
      toast.error(text.failed);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mb-6 space-y-2">
      <Button disabled={isLoading || recurring} onClick={handleCheckout}
        className={`w-full flex items-center justify-center gap-2 py-5 font-medium ${plan.isHighlighted ? "" : "bg-gray-900 text-white dark:bg-white dark:text-gray-900 hover:bg-gray-800 dark:hover:bg-gray-100"}`}>
        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : localizedPlan.buttonText || plan.buttonText}
        {plan.isHighlighted && !isLoading && <MousePointerClick className="w-5 h-5 ml-2" />}
      </Button>
      {recurring && <p className="text-sm text-muted-foreground">{text.unavailable}</p>}
      {checkoutUrl && <a href={checkoutUrl} target="_blank" rel="noopener noreferrer nofollow" className="block text-sm text-center underline">{text.open}</a>}
      {orderId && <button onClick={() => router.push(`/payment/order?order_id=${encodeURIComponent(orderId)}`)} className="block w-full text-sm text-center underline">{text.check}</button>}
    </div>
  );
}
