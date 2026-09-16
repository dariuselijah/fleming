type FetchClientInit = RequestInit & {
  /** Optional browser-side timeout. Useful for long switch calls where the server has a known upper bound. */
  timeoutMs?: number
}

export async function fetchClient(input: RequestInfo, init?: FetchClientInit) {
  const csrf = document.cookie
    .split("; ")
    .find((c) => c.startsWith("csrf_token="))
    ?.split("=")[1]

  const { timeoutMs, signal, ...fetchInit } = init ?? {}
  const controller =
    typeof timeoutMs === "number" && timeoutMs > 0 ? new AbortController() : null
  const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : null

  if (controller && signal) {
    if (signal.aborted) controller.abort()
    else signal.addEventListener("abort", () => controller.abort(), { once: true })
  }

  try {
    return await fetch(input, {
      ...fetchInit,
      signal: controller?.signal ?? signal,
      headers: {
        ...(init?.headers || {}),
        "x-csrf-token": csrf || "",
        "Content-Type": "application/json",
      },
    })
  } finally {
    if (timer != null) window.clearTimeout(timer)
  }
}
