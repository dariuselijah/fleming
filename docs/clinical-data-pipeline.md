# Clinical data pipeline

Open [`clinical-data-pipeline.excalidraw`](./clinical-data-pipeline.excalidraw) in Excalidraw for the visual map.

## Flow

1. **Capture** — scribe transcript + entity extraction (`POST /api/extract-entities`) populate the consult session.
2. **Client context** — `lib/clinical-workspace/build-clinical-context.ts` builds `<patient_context>` + `<scribe_transcript>` (5k tail via `transcript-cap.ts`).
3. **Server context** — `lib/clinical/server-patient-context.ts` decrypts vault encounter state, fetches summaries/facts in parallel, runs hybrid RAG (query = transcript tail, not slash command).
4. **Generation** — `POST /api/chat` merges prompts, tools, and optional evidence (off for ICD/claim). SOAP regenerate passes `omitSoapSections` to drop stale draft.
5. **Parse** — `lib/clinical-workspace/parse-clinical-response.ts` extracts blocks including `=== ICD10_CODES ===` and `=== CLAIM_ITEMS ===` JSON.
6. **Sign / cache** — `POST /api/clinical/encounter-summary` upserts `practice_encounter_summaries`, promotes chart facts, warms `patient_ai_rollups`. UI reads `GET /api/patients/:id/ai-summary`.

## Artifact-specific inputs

| Artifact | Slash | Extra model inputs | Parser |
|----------|-------|-------------------|--------|
| SOAP | `/soap` | transcript, entities, prior blocks (excluded on regen) | SOAP sections |
| ICD-10 | `/icd` | same + no evidence preflight | `ICD10_CODES` JSON |
| Claim | `/claim` | Medprax search tool, claim JSON block | `CLAIM_ITEMS` JSON |
| Rx | `/prescribe` | meds/allergies, prescribe tool | PRESCRIPTION block |
| Referral | `/refer` | problems, referral template | REFERRAL block |
| Visit summary | sign consult | full SOAP + transcript | separate summary route |

## Key files

- Client prompts: `app/components/chat/chat.tsx`, `app/components/chat-input/chat-input.tsx`
- Server route: `app/api/chat/route.ts`
- Citation dedup extracted: `lib/chat-route/citation-dedup.ts`
- Universal summary: `lib/patient/generate-patient-ai-rollup.ts`, `app/api/patients/[id]/ai-summary/route.ts`
