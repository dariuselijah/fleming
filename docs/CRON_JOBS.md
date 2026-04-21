# Cron jobs (Vercel + manual testing)

Cron routes live under `app/api/cron/*/route.ts`. Schedules are defined in `vercel.json` at the repo root.

## Environment

| Variable | Purpose |
|----------|---------|
| `CRON_SECRET` | Optional but **recommended in production**. When set, each cron `GET` must send `Authorization: Bearer <CRON_SECRET>`. Vercel’s managed cron invocations do not send this header unless you add a custom integration—so for Vercel you typically either omit `CRON_SECRET` in the deployment that uses Vercel Cron, or protect routes differently. For **manual** runs (curl, CI), set the secret and pass the header. |
| `SUPABASE_SERVICE_ROLE_KEY` / `NEXT_PUBLIC_SUPABASE_URL` | Crons use the admin Supabase client. |
| Twilio + `TWILIO_WEBHOOK_BASE_URL` | Needed for messaging-related retries and provisioning (see comms docs). |

## Vercel: enable crons

1. Deploy the project to Vercel (crons are read from `vercel.json`).
2. In **Vercel → Project → Settings → Cron Jobs**, confirm the listed paths match `vercel.json`.
3. Production URL will call each path on the schedule (e.g. every 15 minutes for reminders).

## Manual test (local or any URL)

```bash
export CRON_SECRET="your-secret"   # if set in .env
export BASE="http://localhost:3000" # or https://your-app.vercel.app

curl -sS -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/appointment-reminders"
```

If `CRON_SECRET` is unset, a plain `curl "$BASE/api/cron/appointment-reminders"` works in dev.

## Schedules (see `vercel.json` for truth)

| Path | Typical schedule | Role |
|------|------------------|------|
| `/api/cron/appointment-reminders` | Every 15 min | SMS/RCS templates 24h and 1h before appointments |
| `/api/cron/appointment-voice-checkin` | Every 15 min | Outbound **Vapi** call ~24h before visit |
| `/api/cron/post-visit-message` | Hourly | SMS/RCS post-visit follow-up after completed visits |
| `/api/cron/post-visit-voice` | Hourly | Outbound Vapi post-visit follow-up |
| `/api/cron/payment-reminders` | Daily (08:00 UTC in repo) | Payment reminder messages (stub / balance logic) |
| `/api/cron/webhook-retry` | Every 5 min | Retries failed Twilio messaging webhooks |
| `/api/cron/session-cleanup` | Hourly | Thread/session housekeeping |
| `/api/cron/delta-sync` | Daily | PubMed delta (not patient comms) |

---

## When **AI voice (Vapi)** runs

| Trigger | What happens |
|---------|----------------|
| **Inbound call** | Patient dials the practice’s Twilio number. Vapi sends `assistant-request` to `/api/comms/voice/webhook`. The app resolves **practice** by `vapi_phone_number_id` (preferred) or the called **E.164** on `practice_channels` (`channel_type = voice`). Each practice should have its own row with `vapi_assistant_id` + `vapi_phone_number_id` after provisioning. |
| **Provisioning** | After linking a Twilio number, `ensureVoiceChannelForNumber` clones `VAPI_DEFAULT_ASSISTANT_ID` and imports the Twilio number into Vapi (`VAPI_API_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`). **Multi-practice:** repeat per practice (each practice gets its own assistant clone + phone number id). |
| **Outbound cron** `appointment-voice-checkin` | For appointments 23–25h away, places an outbound call via `createOutboundCall` if voice channel is active and metadata allows. |
| **Outbound cron** `post-visit-voice` | Hourly window for post-visit voice follow-up (see route for rules). |
| **Staff API** `POST /api/comms/voice/outbound` | Authenticated staff triggers an outbound call with `patientPhone` + optional `purpose` / `appointmentId`. |

## When **RCS / SMS** (Twilio Messaging) runs

Implementation uses **Twilio’s Messaging API** (`sendSmsMessage`). Devices that support **RCS** may show rich features; others get SMS.

| Trigger | What happens |
|---------|----------------|
| **Inbound SMS** | Twilio → `/api/comms/messaging/webhook` → thread + agent reply. |
| **Cron** `appointment-reminders` | Templates `appointment_reminder_24h` / `appointment_reminder_1h` when appointment window matches. |
| **Cron** `post-visit-message` | Template `post_visit_followup` 2–48h after a **completed** visit (once per appointment metadata). |
| **Cron** `payment-reminders` | Payment reminder template when balance rules match (see route). |
| **Voice webhook** `end-of-call-report` | May call `dispatchPostVoiceFollowUp` → `welcome_onboarding` + portal link when profile incomplete. |
| **Staff** `/api/comms/send` | Staff outbound message to patient thread. |

---

## Quick multi-practice Vapi checklist

1. **Secrets:** `VAPI_API_KEY` (or `VAPI_PRIVATE_KEY`), `VAPI_DEFAULT_ASSISTANT_ID`, Twilio credentials, `TWILIO_WEBHOOK_BASE_URL` (public HTTPS base for webhooks).
2. **Per practice:** Admin → **Channels** → link or buy a number. That provisions **RCS/SMS** + **voice** rows (clone assistant + import number).
3. **Vapi dashboard:** Confirm each practice line shows the imported number and assistant; inbound URL should point to `/api/comms/voice/webhook`.
4. **Signature:** Set `VAPI_SERVER_SECRET` and configure the same secret in Vapi for webhook signing (see `validateVapiSignature` in voice webhook).
