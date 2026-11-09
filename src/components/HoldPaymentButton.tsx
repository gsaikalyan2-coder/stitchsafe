"use client";

// src/components/HoldPaymentButton.tsx
// PayPal hold-payment button. Uses legacy PayPalScriptProvider with intent:authorize.

import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";

interface HoldPaymentButtonProps {
  orderId: string;
  onSuccess?: () => void;
  onError?: (err: unknown) => void;
}

export function HoldPaymentButton({ orderId, onSuccess, onError }: HoldPaymentButtonProps) {
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID ?? "";

  return (
    <PayPalScriptProvider
      options={{ clientId, intent: "authorize", currency: "USD" }}
    >
      <PayPalButtons
        style={{ label: "pay" }}
        createOrder={async () => {
          const res = await fetch(`/api/orders/${orderId}/payment`, { method: "POST" });
          if (!res.ok) throw new Error("Failed to create PayPal order");
          const data = (await res.json()) as { paypalOrderId: string };
          return data.paypalOrderId;
        }}
        onApprove={async (data) => {
          const res = await fetch(`/api/orders/${orderId}/payment/authorize`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ paypalOrderId: data.orderID }),
          });
          if (!res.ok) throw new Error("Failed to authorize payment");
          onSuccess?.();
        }}
        onError={onError}
      >
        Hold payment
      </PayPalButtons>
    </PayPalScriptProvider>
  );
}
