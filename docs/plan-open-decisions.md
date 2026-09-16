# Plan decisions (interim)

Resolved **for this merge** so work can ship; revisit with product/legal as needed.

| Topic | Interim decision |
|--------|------------------|
| **Timezones** | Keep current string `appt_date` / `start_time` behavior. Add `practice_timezone` and TZ-aware bounds in a follow-up when practices report drift. |
| **Concurrent booking** | Rely on `isSlotBookable` pre-check + clear errors on insert conflict. Add exclusion constraint / `23P01` → `slot_taken` when load warrants it. |
| **Per-provider hours / leave** | Continue using practice-level hours in `find_available_slots`. Model `practice_provider_hours` / time-off later. |
| **Legacy `provider_staff_id` null** | Treat null-provider rows as practice-wide; availability logic should not let them block a named provider’s column (align with calendar conflict rules). |
| **No-show vs cancelled** | Cancelled frees slots visually and in availability; `no_show` stays “active” until product defines refund / recurrence rules. |
| **Cancel notifications** | No auto-SMS in this PR; add `send_appointment_cancellation` when templates exist. |
| **Patient edit audit** | Client applies encrypted fields; server audit via `POST /api/assistant/confirm-patient-edit` records `patient_edit_confirmed` when user confirms in UI. |
| **Encrypted fields** | All PHI-style profile edits go through client encrypt + existing Supabase mutators; tools only propose. |
| **Attachments** | No virus/OCR in MVP; MIME allowlist + 20MB cap only. |
| **Cash drawer roles** | Same role gate as API; no cross-user close override in this PR. |
| **Invoice aging** | `list_outstanding_invoices` filters by `created_at` + optional `agingDays`. Add `due_at` / overdue semantics when billing schema gains it. |
| **Calendar styling** | Per-provider swimlanes use shared grid styling; distinct provider labels in-column (colour polish later). |
| **Booking card provider step** | Skip provider step when exactly one bookable provider; show when multiple. |
| **Voice in booking card** | Notes remain typed in-card; composer mic still available. |
| **Deposit at booking** | Not in this PR. |
| **Patient AI rollup** | Computed on demand with timestamp-based cache in `POST /api/patients/[id]/ai-rollup`; optional `practice_patient_ai_rollup` table later for offline. |
