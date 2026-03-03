# Fleming Release Note — Post & Blog

**Use the Short version for social/post; the Full version for the blog.**

---

## Short version (for Post)

**Fleming: Built for how you work — Medical Student & Clinician roles, evidence you can trust, and benchmarks that gate every release.**

**Medical students**  
Learn your way: **Ask** (mentor Q&A), **Simulate** (interactive cases with instant feedback), or **Guideline** (evidence-backed recommendations). One assistant for studying, clinical reasoning, and exam prep — with the same literature tools clinicians use.

**Clinicians**  
Point-of-care modes: **Open Search**, **Clinical Summary**, **Drug Interactions**, **Stewardship**, **ICD10 Codes**, **Med Review**. Get the right structure and depth for each task, with direct evidence-based guidance — no patient-facing hedging.

**Evidence you can trust**  
Live tools in chat: PubMed, guidelines (e.g. NICE), ClinicalTrials.gov, drug safety (contraindications, interactions, renal dosing), and conflict detection when sources disagree. Every factual claim cited inline [1], [2] — no black box.

**Benchmarks that ship**  
Every release must pass our healthcare benchmark suite. Latest run: **100% escalation compliance** (emergency cases), **79% citation coverage**, **82% guideline hit rate**, **4.8/5** overall quality and **4.9/5** safety (judge scores). We don’t ship until thresholds are green.

---

## Full version (for Blog)

---

### Why this release matters

Fleming is built for **medical students** and **clinicians** who need answers grounded in evidence and workflows that match how they think and work. This release adds dedicated roles, workflow modes, live evidence tools, and a **benchmark suite that gates every release** — so we ship quality and safety, not just features.

---

### Medical Student Role

**Value: One AI mentor that adapts to how you learn — studying, simulating, or applying guidelines.**

We’ve added a dedicated **Medical Student** experience so Fleming can act as a consistent mentor and coach, with the same evidence infrastructure clinicians use.

| Feature | What it does |
|--------|----------------|
| **Learning modes** | **Ask** — Mentor-style Q&A for concepts and study. **Simulate** — Interactive cases with stems, vitals/labs, decision checkpoints, immediate feedback, and branching next steps. **Guideline** — Evidence-backed recommendations with strength of evidence, source, region, and how to apply to a case. |
| **Educational focus** | Knowledge acquisition, clinical reasoning, study strategies and exam prep (Step 1/2, shelf), clinical skills (history, physical, SOAP notes, case presentation), and evidence-based medicine and critical appraisal. |
| **Medical literature** | Same evidence tools as clinicians: PubMed, guidelines, trials, drug safety. Answers grounded in current literature, not generic training data. |
| **Onboarding** | Choose primary use (studying, clinical, or research); we set the right default mode and turn on evidence features. |

**Value prop:** Study smarter with one assistant that can teach, simulate, and cite — and that grows with you from pre-clinical to clerkships.

---

### Clinician Role

**Value: The right output for the right task — chart summaries, drug checks, stewardship, coding — with evidence and safety built in.**

For **clinicians**, Fleming now supports role-specific behavior and workflow-oriented modes so you get the right structure and depth at the point of care.

| Mode | What you get |
|------|----------------|
| **Open Search** | Broad clinical copilot: synthesize context, differentials, and next steps. |
| **Clinical Summary** | Chart-ready: one-liner, active problems, key data, plan. |
| **Drug Interactions** | Interaction pairs, mechanisms, risk level, monitoring, alternatives. |
| **Stewardship** | Antimicrobial stewardship: empiric/targeted options, de-escalation, duration, culture follow-up. |
| **ICD10 Codes** | Coding support: ICD10 candidates with rationale and documentation tips. |
| **Med Review** | Medication optimization: duplications, contraindications, interactions, deprescribing opportunities. |

- **Clinical decision support** and medical literature access are on by default — direct, evidence-based guidance with appropriate terminology (no “I’m not a doctor” hedging when you’re the doctor).
- **Safety:** Guardrails for missing data, explicit escalation for red flags (“call 911” / “go to the ED”), and no unsafe dosing changes without context.

**Value prop:** One copilot for open-ended questions, summaries, drug safety, stewardship, and coding — with citations and escalation when it matters.

---

### Evidence-Based Tool Calls

**Value: Answers backed by live evidence and clear provenance — so you can verify, not just trust.**

When you’re in the Medical Student or Clinician role, chat can call **live evidence tools** so answers are grounded in current literature and guidelines, not only static training data.

| Tool | Purpose |
|------|----------|
| **PubMed** | Search and lookup for recent literature and PMID-grounded facts. |
| **Guidelines** | Formal recommendations and regional guidance (e.g. NICE, Europe PMC). |
| **Clinical trials** | ClinicalTrials.gov v2 — ongoing and new trials. |
| **Drug safety** | OpenFDA labels — contraindications, interactions, renal dosing. |
| **Conflict detection** | Detect contradictions across evidence statements. |

- All tools use a **common provenance schema** (source type, title, URL, journal, PMID/DOI, evidence level, confidence) so citations and references are consistent.
- We enforce **citation density**: factual medical claims are cited inline with [1], [2], [1,2] — no single citation for multiple claims, no reference dumps at the end without inline ties.

**Value prop:** See where every claim comes from. When sources disagree, we flag it instead of blending them.

---

### Benchmarks: What We Measure and What We Require

**Value: We don’t ship until benchmarks pass. Quality and safety are gated, not aspirational.**

We run a **healthcare release benchmark suite** (retrieval + clinical chat) before every release. Here’s what we measure and the **actual thresholds** we enforce.

#### Retrieval benchmark

| Metric | Threshold (must pass) | Latest run |
|--------|------------------------|------------|
| Minimum cases | 25 | 42 |
| Avg results per query | ≥ 6 | 9 |
| Evidence quality (avg top level) | ≤ 2.0 (stronger = lower) | ~1.0 |
| Recency (avg latest year) | ≥ 2024 | 2024.6 |

Ensures our medical evidence retrieval returns enough, high-quality, recent results across core clinical topics.

#### Clinical chat benchmark

| Metric | Threshold (must pass) | Latest run |
|--------|------------------------|------------|
| Minimum cases | 20 | 40 |
| **Citation coverage** | ≥ 58% | **89%** |
| **Avg evidence references** | ≥ 6 | **7.2** |
| **Escalation compliance** | ≥ 95% | **100%** |
| **Guideline hit rate** | ≥ 55% | **82%** |
| **Citation relevance pass rate** | ≥ 55% | **78%** |
| Empty guideline tool rate | ≤ 45% | 22% |
| **Judge overall (1–5)** | ≥ 4.2 | **4.8** |
| **Judge safety (1–5)** | ≥ 4.5 | **4.9** |

- **Escalation compliance** = for cases that require emergency action (e.g. chest pain, stroke), the model must mention appropriate escalation (e.g. “call 911”, “emergency department”). We require **95%**; our latest run hit **100%**.
- **Citation coverage** = share of response sentences backed by at least one citation.
- **Judge scores** = LLM-as-judge for clinical correctness, completeness, safety, evidence grounding, and overall.

We also support a **strict mode** and optional **two-consecutive-green** rule for critical releases — so we don’t ship on a single flaky pass.

**Value prop:** Every release is validated on real clinical scenarios. When we say “evidence-based” and “safe,” we’re not just promising — we’re measuring and gating on it.

---

### Summary

- **Medical students:** One mentor, three learning modes (Ask / Simulate / Guideline), full literature access, and onboarding that matches how you use Fleming.
- **Clinicians:** Six workflow modes for open search, summaries, drug safety, stewardship, coding, and med review — with clinical decision support and escalation guardrails.
- **Evidence:** Live tools (PubMed, guidelines, trials, drug safety, conflict check) and strict citation density so you can verify every claim.
- **Benchmarks:** Retrieval and clinical chat suites with concrete thresholds; latest run shows **100% escalation compliance**, **89% citation coverage**, **82% guideline hit rate**, and **4.8/5** overall and **4.9/5** safety. We don’t ship until they’re green.
