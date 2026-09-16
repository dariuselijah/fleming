type Listener = () => void

const threadListeners = new Set<Listener>()
const inboxListeners = new Set<Listener>()

export function onWorkQueueThreadsRefresh(listener: Listener): () => void {
  threadListeners.add(listener)
  return () => threadListeners.delete(listener)
}

export function emitWorkQueueThreadsRefresh(): void {
  for (const l of threadListeners) l()
}

export function onWorkQueueInboxRefresh(listener: Listener): () => void {
  inboxListeners.add(listener)
  return () => inboxListeners.delete(listener)
}

export function emitWorkQueueInboxRefresh(): void {
  for (const l of inboxListeners) l()
}
