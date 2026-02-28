## Med Student Learning Layer: Validation Plan

### Objective

Validate that the learning layer improves educational outcomes while maintaining safety, speed, and UI clarity.

## Success Metrics

### UX Metrics

- `modeAdoptionRate`: % of medical-student sessions using `simulate` or `guideline`.
- `simulationCompletionRate`: % of simulations reaching a decision checkpoint.
- `guidelineCardExpandRate`: % of guideline cards where users view details/follow-up prompts.
- `nextQuestionDepth`: average number of meaningful follow-up questions per session.

### Learning Metrics

- `gapDetectionCoverage`: % of completed simulations producing at least one skill-gap signal.
- `alignmentReuseRate`: % of sessions where users reuse suggested next-step actions.
- `studyPlanCarryover7d`: % of users returning to a recommended follow-up within 7 days.

### Safety & Evidence Metrics

- `guidelineCitationPresence`: % of guideline-mode responses with citation references.
- `uncertaintyDisclosureRate`: % of conflicting/sparse-evidence prompts with explicit uncertainty text.
- `conflictHandlingRate`: % of contradiction scenarios where disagreement is surfaced.

### Performance Metrics

- `ttftDeltaMs`: time-to-first-token delta versus baseline chat flow.
- `cardRenderLatencyMs`: time from response render to card visual completion.
- `streamInterruptionRate`: % sessions with interrupted response stream.

## Experiment Design

### Phase A: Internal QA

- Verify simulation/guideline card parsing under varied LLM outputs.
- Validate fallback behavior when card block is malformed or missing.
- Confirm citation UI continuity for evidence-backed responses.

### Phase B: Controlled rollout (10-20% medical students)

- A/B test:
  - Control: chat without learning mode selector.
  - Treatment: selector + card rendering + mode routing.
- Duration: 2 weeks minimum.
- Primary decision metric: `simulationCompletionRate`.

### Phase C: Full rollout gate

Require all gates to pass:
- No regression in `ttftDeltaMs` beyond threshold.
- Safety metrics above minimum thresholds.
- Positive directional movement in 3+ UX/Learning metrics.

## Rollout Checkpoints

1. **Checkpoint 1 (Day 3)**: parser reliability and UI integrity.
2. **Checkpoint 2 (Week 1)**: adoption + interaction depth.
3. **Checkpoint 3 (Week 2)**: safety + evidence quality.
4. **Checkpoint 4 (Week 3)**: go/no-go for broader exposure.

## Minimum Thresholds (Initial)

- `guidelineCitationPresence` >= 0.85
- `uncertaintyDisclosureRate` >= 0.90 for flagged prompts
- `ttftDeltaMs` <= +250ms from baseline
- `simulationCompletionRate` >= 0.45

## Instrumentation Notes

- Emit events from the client when mode changes and cards render.
- Add server-side mode labels to chat logs for clean cohort analysis.
- Store mode and event timestamps with chat/session IDs for replayability.
