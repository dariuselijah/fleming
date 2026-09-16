# Patient overview API & sidebar

## Endpoint

`GET /api/patients/:id/overview` (authenticated practice member)

Returns a single payload for the patient directory detail panel:

- `aiContext` — latest chief complaint, summary snippet, key findings, follow-up (from `practice_encounter_summaries`).
- `appointments` — recent `practice_appointments` rows, each with optional `encounter_summary` when linked by `appointment_id`, `linked_consult_id`, or matching encounter.
- `attachments` — `patient_attachments` with short-lived signed URLs (`patient-attachments` bucket).
- `chartFacts` — promoted rows from `patient_chart_facts` (filled when a signed consult summary is generated).
- `notes` — recent `patient_notes`.
- `encounterSummaries` — full recent summary list for “all visits”.

Types: [`lib/patient/patient-overview-types.ts`](../lib/patient/patient-overview-types.ts).

## Data linkage

- `clinical_encounters.appointment_id` — set from the active consult session when the visit was opened from a booking.
- `practice_encounter_summaries.appointment_id` — set when the AI summary is generated; `practice_appointments.linked_consult_id` is updated to the encounter id.
- Chart promotion runs in [`app/api/clinical/encounter-summary/route.ts`](../app/api/clinical/encounter-summary/route.ts) after a successful summary upsert.

## Security

- All new tables use `RLS` + `is_practice_member(practice_id)` policies (see migration `20260427120000_patient_sidebar_encounter_linkage_chart_facts.sql`).
- Overview uses the same authenticated Supabase client as other patient APIs; signed URLs are created with the admin client server-side only.

## Manual verification

1. Book an appointment for a patient; open consult from calendar → sign consult.
2. Open patient in directory: detail panel should show AI context, appointment row with expandable summary, and chart facts.
3. Upload a file via assistant: “Files” updates (realtime or refresh).
4. Run `npx ts-node --compiler-options '{"module":"commonjs"}' scripts/test-patient-overview-shape.ts` to sanity-check the response shape (requires local API or mock).
