# Clinician Workflow PRDs

## 1. Clinical Summary
### User
Clinician who needs a concise, chart-ready summary from messy clinical context.

### Inputs
- note excerpt or patient context
- care setting
- key pending questions

### Output
- one-liner
- active problems
- key trends
- immediate plan
- watch items / escalation triggers

### Trust Requirements
- visible evidence count
- confidence state
- guideline signal when relevant
- prompt for missing context before strong recommendations

## 2. Drug Interactions
### User
Clinician checking whether a regimen is safe in a specific patient.

### Inputs
- medication list
- renal/hepatic function
- QT / bleeding / sedation risk
- pregnancy or allergy context

### Output
- ranked interaction severity
- mechanism
- expected clinical impact
- monitoring plan
- safer alternatives

### Trust Requirements
- citation-linked interaction logic
- highlight if evidence is thin or indirect
- force missing-data warning when renal/hepatic context is absent

## 3. Stewardship
### User
Clinician choosing or narrowing antimicrobials under time pressure.

### Inputs
- syndrome
- severity
- likely source
- allergies
- renal function
- prior antibiotics
- cultures / susceptibilities

### Output
- syndrome framing
- empiric options
- de-escalation triggers
- duration guidance
- follow-up culture checkpoints

### Trust Requirements
- guideline-aware output when available
- explicit uncertainty when microbiology data is incomplete
- benchmark-backed badge on the workflow surface

## 4. Med Review
### User
Clinician reviewing polypharmacy or medication optimization opportunities.

### Inputs
- medication list
- comorbidities
- renal/hepatic function
- age / falls / bleeding risks
- goals of care

### Output
- highest-risk meds ranked
- duplications
- contraindications
- deprescribing / optimization opportunities
- monitoring and counseling plan

### Trust Requirements
- visible evidence count
- confidence state
- prompt for missing context before medication changes

## Shared Acceptance Criteria
- Output must be scannable in under 5 seconds.
- Output must be copy-ready for clinician workflow.
- Evidence-backed answers must render trust metadata in-product.
- Core workflows should be benchmarked before release.
