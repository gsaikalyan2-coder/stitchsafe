// src/server/events.ts
// Append an OrderEvent inside an existing Prisma transaction.
// Always call this inside prisma.$transaction — never standalone.

import type { OrderState, Prisma } from "@/generated/prisma/client";

type JsonPayload = Prisma.InputJsonValue;

export interface AppendEventInput {
  orderId: string;
  fromState?: OrderState;
  toState: OrderState;
  actorId?: string;
  /** Defaults to "STATE_CHANGE" */
  type?: string;
  /** Arbitrary JSON payload (PayPal IDs, request IDs, etc.) */
  payload?: Record<string, unknown>;
  note?: string;
}

export async function appendOrderEvent(
  tx: Prisma.TransactionClient,
  input: AppendEventInput,
): Promise<void> {
  await tx.orderEvent.create({
    data: {
      orderId: input.orderId,
      fromState: input.fromState,
      toState: input.toState,
      actorId: input.actorId,
      type: input.type ?? "STATE_CHANGE",
      payload: (input.payload as JsonPayload | undefined) ?? undefined,
      note: input.note,
    },
  });
}
