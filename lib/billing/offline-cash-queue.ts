"use client"

import { get, set, del } from "idb-keyval"

const KEY_PREFIX = "billing-cash-queue:"

export type QueuedCashPayment = {
  invoiceId: string
  amountCents: number
  idempotencyKey: string
  deliverEmail?: boolean
  deliverSms?: boolean
  reference?: string
  queuedAt: string
}

export async function queueCashPayment(item: Omit<QueuedCashPayment, "queuedAt">): Promise<void> {
  const row: QueuedCashPayment = { ...item, queuedAt: new Date().toISOString() }
  await set(`${KEY_PREFIX}${item.idempotencyKey}`, row)
}

export async function drainCashPaymentQueue(
  flush: (item: QueuedCashPayment) => Promise<void>
): Promise<number> {
  if (typeof window === "undefined") return 0
  // idb-keyval has no list keys; use a well-known index key
  const keys = (await get<string[]>("billing-cash-queue-index")) ?? []
  let n = 0
  const remaining: string[] = []
  for (const idem of keys) {
    const item = await get<QueuedCashPayment>(`${KEY_PREFIX}${idem}`)
    if (!item) continue
    try {
      await flush(item)
      await del(`${KEY_PREFIX}${idem}`)
      n++
    } catch {
      remaining.push(idem)
    }
  }
  await set("billing-cash-queue-index", remaining)
  return n
}

export async function rememberCashQueueKey(idempotencyKey: string): Promise<void> {
  const keys = (await get<string[]>("billing-cash-queue-index")) ?? []
  if (!keys.includes(idempotencyKey)) {
    keys.push(idempotencyKey)
    await set("billing-cash-queue-index", keys)
  }
}
