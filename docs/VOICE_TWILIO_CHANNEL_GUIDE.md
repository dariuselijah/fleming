# Voice (Vapi), Twilio, and channel testing

Single reference for wiring the AI receptionist, fixing outbound call auth errors, and using the admin **Channel tests** lab.

---

## 1. Environment variables

Set these on your deployment (e.g. Vercel), not only on your laptop.

| Variable | Role |
|----------|------|
| `VAPI_API_KEY` | Bearer token for Vapi REST API (or `VAPI_PRIVATE_KEY` if you use that name). |
| `VAPI_SERVER_SECRET` | HMAC secret for `x-vapi-signature` on `POST /api/comms/voice/webhook`. **Required in production** (`NODE_ENV=production`); missing secret rejects webhooks. |
| `VAPI_DEFAULT_ASSISTANT_ID` | Template assistant cloned per practice on provisioning. |
| `TWILIO_ACCOUNT_SID` | Twilio account that **owns** the practice phone number. |
| `TWILIO_AUTH_TOKEN` | Auth token for that same account. |
| `TWILIO_WEBHOOK_BASE_URL` | Public HTTPS **origin only** (no path), e.g. `https://your-app.vercel.app`. Used to build voice + messaging webhook URLs and must match what Twilio calls for signature validation. |

Optional / advanced:

- `VAPI_PHONE_NUMBER_ID` — fallback shared Vapi phone number when clone/import path is not used.
- Messaging: `TWILIO_MESSAGING_SERVICE_SID`, etc. (see `.env.example` and `docs/comms-setup-and-testing.md`).

---

## 2. Webhook URL (Vapi assistant)

1. Open [Vapi Dashboard](https://dashboard.vapi.ai) → your **default assistant** (same ID as `VAPI_DEFAULT_ASSISTANT_ID`).
2. Set **Server URL** to:

   `${TWILIO_WEBHOOK_BASE_URL}/api/comms/voice/webhook`

   Example: `https://your-app.vercel.app/api/comms/voice/webhook`

3. On **Channels** provisioning, Fleming **clones** that assistant per practice and sets `serverUrl` on the clone. If you change domain or tunnel URL, the app can **PATCH** the clone’s `serverUrl` when stored `webhook_url` on `practice_channels` no longer matches the current base.

---

## 3. Webhook events (Fleming)

`POST /api/comms/voice/webhook` handles:

- `assistant-request`
- `function-call`
- `end-of-call-report`
- `status-update`

End-of-call payloads may nest **transcript**, **summary**, and **tool** data under `artifact` / `analysis`; the route normalizes those fields before writing `voice_calls` and thread messages.

---

## 4. Channel Test Lab (admin UI)

**Location:** Admin → **Channels** → **Channel tests** (bento tile below messaging + voice cards).

### 4.1 Outbound (AI calls your handset)

1. Enter your mobile under **Outbound — AI calls your test handset** (E.164 or local ZA; normalized to `+27`).
2. Choose a **Scenario** (saved in the browser).
3. Click **Place outbound test call**.

The API `POST /api/comms/voice/outbound` sends `scenarioId`. Vapi may receive `assistantOverrides` (e.g. `firstMessageMode: assistant-waits-for-user`) so **you** speak first on drills like cancel/reschedule.

### 4.2 Inbound (you dial the practice)

1. Copy the **practice line** shown under **Inbound — you dial the practice** (same number as the voice channel).
2. Use the **same scenario** roleplay script as for outbound: compare behaviour when **you** place the call vs when **Vapi** rings you.

### 4.3 Scenario reference

Canonical definitions live in code: `lib/comms/voice-test-scenarios.ts`. Summary:

| `scenarioId` | Short label | Notes |
|----------------|---------------|--------|
| `voice_channel_smoke` | Smoke / sanity | Default; checks wiring end-to-end. |
| `voice_reception_general` | General | Hours, services. |
| `voice_book` | Book | Booking flow; you speak first (outbound). |
| `voice_cancel` | Cancel | Cancel flow; you speak first. |
| `voice_reschedule` | Reschedule | Reschedule flow; you speak first. |
| `voice_payment` | Payment | Billing / handoff; you speak first. |
| `voice_emergency` | Emergency | Urgent / handoff drill; you speak first. |
| `voice_wrong_number` | Wrong # | Short call; assistant greets first. |

Each scenario includes **roleplay lines** and **verify hints** in the UI (and in the source file).

### 4.4 API: refresh Twilio credentials on the Vapi number

If Twilio auth is wrong or stale (see §5), after fixing env you can sync from the server:

- **UI:** Channels → Voice → **Sync Twilio credentials to Vapi** (when voice is **Ready**).
- **API:** `POST /api/comms/provision` with JSON body `{ "action": "sync_vapi_twilio" }` (authenticated practice **owner** or **admin**).

Implementation: `PATCH https://api.vapi.ai/phone-number/{id}` with `twilioAccountSid` and `twilioAuthToken` from server env (`lib/comms/vapi.ts` → `updateVapiPhoneNumberTwilioCredentials`).

---

## 5. Troubleshooting: `Twilio Error: Authenticate` / `call.start.error-get-transport`

### Cause

Vapi creates the actual PSTN leg via **Twilio**, using **Account SID + Auth Token stored on the Vapi phone-number resource** (set when the number was **imported** into Vapi). Twilio returns **Authenticate** when that pair is wrong, expired, or belongs to a **different** Twilio account than the one that owns the number.

Rotating **Auth Token** in Twilio Console does **not** automatically update Vapi.

### Fix (recommended order)

1. **Twilio Console** → Account → **Account SID** and **Auth Token** for the project that **owns** this phone number (correct subaccount if applicable).

2. **Deployment env** — Set `TWILIO_ACCOUNT_SID` and `TWILIO_AUTH_TOKEN` exactly (no stray spaces). Redeploy so serverless/API routes read the new values.

3. **Push credentials into Vapi** — **Channels → Voice → Sync Twilio credentials to Vapi** (§4.4), then retry an outbound test call.

4. **Manual alternative** — [Vapi Dashboard](https://dashboard.vapi.ai) → Phone numbers → open the number → update Twilio credentials, or call Vapi `PATCH /phone-number/{id}` with `twilioAccountSid` and `twilioAuthToken`.

### Still failing?

- Confirm the number is an **Incoming Phone Number** on **that** Twilio account (not another Twilio project).
- Confirm `VAPI_API_KEY` can PATCH that phone number ID (same org as when the number was created).

---

## 6. Related docs

- `docs/comms-setup-and-testing.md` — Twilio messaging, webhooks, broader comms.
- `docs/CRON_JOBS.md` — Reminders and cron that touch comms.
- `.env.example` — full variable list and comments.

---

*Last updated to match Fleming’s Channel Test Lab, outbound route, provision `sync_vapi_twilio` action, and Vapi helpers in-repo.*
