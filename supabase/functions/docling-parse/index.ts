import "jsr:@supabase/functions-js/edge-runtime.d.ts"

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-runtime-secret",
}

function resolveRuntimeTarget(runtimeUrl: string): string {
  const trimmed = runtimeUrl.trim().replace(/\/+$/, "")
  if (!trimmed) return ""
  if (/\/parse$/i.test(trimmed)) return trimmed
  return `${trimmed}/parse`
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const authHeader = req.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "missing_authorization" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const runtimeUrl = Deno.env.get("DOC_RUNTIME_URL")?.trim()
  if (!runtimeUrl) {
    return new Response(
      JSON.stringify({
        error: "docling_runtime_not_configured",
        hint:
          "Set the Edge Function secret DOC_RUNTIME_URL to your Python Docling HTTP service (see services/docling-runtime).",
      }),
      { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  const target = resolveRuntimeTarget(runtimeUrl)
  if (!target) {
    return new Response(JSON.stringify({ error: "invalid_doc_runtime_url" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  const body = await req.text()
  const runtimeSecret = Deno.env.get("DOC_RUNTIME_SECRET")?.trim() ?? ""

  let upstream: Response
  try {
    upstream = await fetch(target, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(runtimeSecret ? { "X-Runtime-Secret": runtimeSecret } : {}),
      },
      body,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return new Response(
      JSON.stringify({ error: "docling_runtime_unreachable", message }),
      { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }

  const text = await upstream.text()
  const contentType = upstream.headers.get("Content-Type") || "application/json"
  return new Response(text, {
    status: upstream.status,
    headers: { ...corsHeaders, "Content-Type": contentType },
  })
})
