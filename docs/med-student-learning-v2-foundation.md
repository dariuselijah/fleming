## Med Student Learning Layer: V2 Foundation

### Purpose

Define the data, UX, and instrumentation foundation required to ship:
- skill-gap identification,
- training alignment,
- CME activity tracking,
without rebuilding V1 simulation/guideline flows.

### Foundation Principles

- Build on the existing chat-first architecture.
- Keep learner state lightweight and incremental.
- Separate inference-time outputs from durable progress records.
- Ensure all guideline and recommendation surfaces preserve evidence provenance.

## Data Foundation

### 1) Learner competency snapshots

Create a periodic snapshot model instead of mutating one global score. This keeps history auditable.

```ts
type CompetencySnapshot = {
  id: string
  userId: string
  createdAt: string
  sourceSessionId: string
  competencies: Array<{
    key: "clinical_reasoning" | "history_taking" | "physical_exam" | "differential_diagnosis" | "guideline_application"
    score: number // 0-100
    confidence: number // 0-1
    evidence: string[] // short rationale bullets
  }>
}
```

### 2) Training alignment profile

Store one active profile plus versioned updates.

```ts
type TrainingAlignmentProfile = {
  id: string
  userId: string
  activeTrack: "step1" | "step2" | "shelf" | "rotation"
  rotation?: "internal_medicine" | "surgery" | "pediatrics" | "obgyn" | "psychiatry" | "emergency_medicine"
  targetDate?: string
  priorities: string[] // e.g. ["cardiology", "infectious_disease"]
  updatedAt: string
}
```

### 3) CME activity ledger

Start with a neutral activity ledger before institution-specific export formats.

```ts
type CmeActivityLog = {
  id: string
  userId: string
  activityType: "simulation" | "guideline_review" | "assessment"
  title: string
  durationMinutes: number
  completedAt: string
  evidenceSourceCount: number
  selfAttested: boolean
  notes?: string
}
```

## UX Foundation

### Session recap card (post-response)

After simulation sessions, show a recap module with:
- strengths (2-3 bullets),
- misses/risk gaps (2-3 bullets),
- next best action (single CTA),
- alignment tag chips (`Step1`, `Step2`, `Shelf`, `Rotation`).

### Alignment panel (non-blocking)

Add a compact, dismissible panel near chat input for medical students:
- active track,
- next milestone,
- quick track switch.

### CME capture flow

Use one-tap completion:
- `Log learning activity` button on simulation/guideline cards,
- optional modal for duration + notes,
- optimistic save with retry.

## API/Event Contracts

Emit structured events from frontend for analytics and model-quality loops:

```ts
type LearningEvent =
  | { type: "learning_mode_changed"; mode: "ask" | "simulate" | "guideline"; ts: number }
  | { type: "simulation_completed"; sessionId: string; branchDepth: number; ts: number }
  | { type: "guideline_card_viewed"; source: string; evidenceStrength: string; ts: number }
  | { type: "skill_gap_recap_seen"; sessionId: string; ts: number }
  | { type: "cme_activity_logged"; activityId: string; ts: number }
```

## Delivery Sequence

1. Add persistence tables and typed API endpoints for the three core objects.
2. Ship recap card read-only rendering from simulation sessions.
3. Add alignment panel with profile read/write.
4. Add CME activity logging UX and exports (CSV first).
5. Introduce recommendation quality feedback loop from recap outcomes.

## Guardrails

- Never imply formal certification in UI copy until institution requirements are integrated.
- Keep confidence language explicit when evidence is sparse or conflicting.
- Preserve medical student educational boundary (no autonomous treatment directives).
