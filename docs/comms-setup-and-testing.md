# Comms inbox: setup and testing

Admin **Inbox** is WhatsApp-first: threads, notifications, lab queue, and Smart Import share one asymmetric bento layout.

## 1. Database — apply the migration

Run the comms migration so `practice_channels`, `conversation_threads`, `thread_messages`, and related tables exist.

**Option A — Supabase Dashboard**

1. Open **SQL Editor** in your Supabase project.
2. Paste the full contents of `supabase/migrations/20260407120000_comms_platform.sql`.
3. Run the script.

**Option B — Supabase CLI** (after `supabase login` and `supabase link --project-ref <ref>` from the repo root):

```bash
supabase db push
```

If the CLI reports “Cannot find project ref”, use Option A or run `supabase link` once.

**Prerequisites:** Earlier migrations that create `public.practices`, `practice_members`, and `is_practice_member()` must already be applied (see `20260406120000_clinical_workspace_e2ee_rag.sql`).

**Media (optional):** If you use uploads, add a storage bucket per `lib/comms/media-pipeline.ts` (e.g. `comms-media`) and policies.

## 2. Environment variables

Copy from `.env.example` and set at least:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | User-scoped client |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; webhooks, practice bootstrap (`lib/supabase/admin.ts`) |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio API |
| `TWILIO_WEBHOOK_BASE_URL` | Public HTTPS origin only, no path |

**Optional (voice / Vapi backends only):** `VAPI_API_KEY`, `VAPI_SERVER_SECRET`, `VAPI_DEFAULT_ASSISTANT_ID`, `VAPI_PHONE_NUMBER_ID`.

**Tuning:** `COMMS_AGENT_MODEL`, `COMMS_AGENT_TEMPERATURE`.

Legacy: some tooling still accepts `SUPABASE_SERVICE_ROLE`; the app’s admin client prefers `SUPABASE_SERVICE_ROLE_KEY`.

## 3. Webhook URLs

With `TWILIO_WEBHOOK_BASE_URL=https://your-domain.com`, configure Twilio WhatsApp / status callbacks to the routes under `app/api/comms/` as returned by your provision flow.

For local dev, use **ngrok** (or similar) so Twilio can reach your machine.

## 4. Admin UI

1. **Admin → Inbox** — If there is no `practice_channels` row, you’ll see the **Patient messaging** WhatsApp setup card.
2. **Admin → Channels** — Provision a WhatsApp number and paste webhook URLs into Twilio where prompted.
3. After channels exist, conversations load from `GET /api/comms/threads`.

## 5. Testing

1. **Provision status**: `GET /api/comms/provision/status` (authenticated) — `channels`, `hours`, `faqs` (or `noPractice: true` until bootstrap completes).
2. **Inbound WhatsApp**: Message your sender; confirm `conversation_threads` and the Inbox list update.
3. **Outbound (staff)**: `POST /api/comms/whatsapp/send` with `threadId` and `message`.
4. **Notifications / labs**: Workspace store + **Lab Results** (`channel === "lab"`) and the notification strip / feed.

## 6. Troubleshooting

- **401 / no threads**: Log in; ensure `POST /api/clinical/practice/bootstrap` succeeded (needs `SUPABASE_SERVICE_ROLE_KEY`) so `practice_members` exists.
- **Webhooks 500**: Confirm service role and that the comms migration ran.
- **Empty threads with an active channel**: Verify Twilio callback URL and inbound traffic to `/api/comms/whatsapp/webhook`.
- **Dev `ENOENT` under `.next`**: `rm -rf .next && npm run dev`.
