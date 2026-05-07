# Docling HTTP runtime (Python)

The Supabase Edge Function `docling-parse` **does not run Docling inside Deno**. It authenticates requests and proxies JSON to this service.

## Deploy

1. Build and run (Docker):

```bash
cd services/docling-runtime
docker build -t docling-runtime .
docker run -p 8088:8088 \
  -e DOC_RUNTIME_SECRET=your-shared-secret \
  docling-runtime
```

2. Expose the service (same VPC as Supabase if private, or HTTPS URL).

3. In Supabase Dashboard → **Edge Functions** → `docling-parse` → **Secrets**:

- `DOC_RUNTIME_URL` — base URL, e.g. `https://docling.yourdomain.com` (the Edge Function appends `/parse`). **Required** for the proxy to return 200; without it the function responds with `docling_runtime_not_configured`.
- `DOC_RUNTIME_SECRET` — optional; must match `DOC_RUNTIME_SECRET` on the Python container if set.

The `docling-parse` function is deployed to your Supabase project; invoke URL pattern:

`{SUPABASE_URL}/functions/v1/docling-parse`

4. Set **Next.js** env (or rely on auto-resolution):

- `DOCLING_SERVICE_URL` — optional; defaults to `{SUPABASE_URL}/functions/v1/docling-parse` when unset.
- `SUPABASE_SERVICE_ROLE_KEY` — server-side calls to the Edge Function need a valid JWT (service role works).

## API

`POST /parse` with JSON body matching `lib/media/docling-client.ts`:

```json
{
  "fileName": "x.pdf",
  "mimeType": "application/pdf",
  "contentBase64": "...",
  "fileUrl": "https://...",
  "options": { "extractFigures": true, "extractPreview": true, "includeCaptions": true, "maxFiguresPerUnit": 4 }
}
```

Use `fileUrl` for larger files so the runtime can fetch the object directly from storage without sending the whole document inline as base64.

Return JSON with `sourceUnits` (or `units` / `pages`) per the client normalizer.
