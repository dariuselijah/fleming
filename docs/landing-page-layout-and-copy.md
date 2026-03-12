# AskFleming Landing Page — Layout, Copy & Visual Direction

**Purpose:** Exact layout, section-by-section copy, and design direction for a sleek, animation-forward landing that explains features for general users, medical students, and clinicians.

**Design ethos:** Super sleek. Minimal chrome, generous whitespace, subtle motion, clear hierarchy. Dark or light theme with one strong accent. No clutter.

---

## Global

- **Nav:** Logo left. Links: For students · For clinicians · Evidence & trust · (optional) Design partners. CTA button right: **Start free** or **Try AskFleming**.
- **Footer:** Terms · Privacy · Contact. Optional: Trust page, Methodology.
- **Motion:** Prefer reduced-motion respect (`prefers-reduced-motion`). Default: gentle fade/scale on scroll, staggered item entrances, soft parallax on hero only. No auto-playing loops that distract.

---

## Section 1 — Hero

**Layout:** Full viewport or near-full. Centered block. Optional: soft gradient or mesh background; optional subtle grid or line art. No heavy imagery in hero.

**Copy**

- **Headline (H1):**  
  **Finish the work.**  
  *(or)*  
  **From question to answer — with evidence you can see.**

- **Subline (one line):**  
  AskFleming is the medical AI that gives you the right output for the task: chart-ready summaries, drug checks, interactive cases, and every claim cited.

- **CTA:**  
  **[ Start free ]**  
  Secondary: *No credit card · Bring your own API key or use ours*

**Visual direction**
- Headline: Large, bold, 1–3 words per line. Slight letter-spacing. Fade-in + light scale (e.g. 0.98 → 1) on load; 400–600ms ease-out.
- Subline: Smaller weight, max-width ~640px, fade-in after headline (stagger 150–200ms).
- CTA: Solid or gradient pill; hover: slight scale (1.02) and glow/shadow. Optional: very subtle floating particles or gradient blob in background (low opacity, slow drift).
- **Animation:** On load: headline → subline → CTA, each with short delay. Optional: thin line or dot that draws under the headline (SVG path animation).

---

## Section 2 — Who it’s for (audience switcher)

**Layout:** Three cards or tabs in a row (or stacked on mobile). One line each + icon or minimal illustration. Click/tap to scroll to that audience’s section or to toggle content below.

**Copy**

- **Section label (small caps or overline):**  
  WHO IT’S FOR

- **Card 1 — General:**  
  **Everyone**  
  Multi-model chat, your keys or ours. Health insights when you need them.

- **Card 2 — Students:**  
  **Medical students**  
  One mentor. Ask, simulate cases, or apply guidelines — with the same evidence tools as clinicians.

- **Card 3 — Clinicians:**  
  **Clinicians**  
  Six workflow modes. Chart-ready summaries, drug safety, stewardship, coding. Evidence and escalation built in.

**Visual direction**
- Cards: Subtle border or card shadow; hover: lift 2–4px, border/glow. Staggered fade-up on scroll (each card 80–100ms apart).
- Optional: soft gradient per card (e.g. blue tint general, green students, slate clinicians). Icons: simple line or duotone, one color + neutral.
- **Animation:** Cards fade-up into place when section enters viewport; optional subtle pulse on “active” card if one is pre-selected.

---

## Section 3 — For everyone (general users)

**Layout:** Two-column or stacked. Left: short copy. Right: product shot or abstract visual (chat bubbles, model icons, key icon). Keep it minimal.

**Copy**

- **Section label:**  
  FOR EVERYONE

- **Headline:**  
  **Your keys. Your models. Your control.**

- **Body:**  
  Use AskFleming with your own API keys or ours. Switch between leading models — Grok, GPT-4o, Claude, Gemini — or run local models with Ollama. Upload files, ask health-related questions, and turn on evidence tools whenever you want citations.

- **Bullets (short):**
  - Bring your own key (BYOK)
  - Multi-model: Grok-4, GPT-4o, Claude, Gemini, Ollama
  - File uploads and data analysis
  - Evidence and citations when you need them

**Visual direction**
- Clean two-column grid; image/visual fades in or slides in from the side (e.g. from right, 20–30% translate, 500ms).
- Bullets: Small icon or dot; optional staggered fade. No heavy illustrations — prefer UI mock or abstract shapes.
- **Animation:** Section fade-up on scroll; content column and visual column can stagger by 100–150ms.

---

## Section 4 — For medical students

**Layout:** Section label + headline left or center. Three mode cards (Ask · Simulate · Guideline) in a row or 1–2–1. One line per mode + one short sentence. Optional: screenshot of Simulate or guideline card.

**Copy**

- **Section label:**  
  FOR MEDICAL STUDENTS

- **Headline:**  
  **One mentor. Three ways to learn.**

- **Subline:**  
  Study concepts, run interactive cases, or apply evidence-based guidelines — with the same literature tools clinicians use.

- **Mode 1 — Ask:**  
  **Ask**  
  Mentor-style Q&A for concepts, study strategies, and exam prep (Step 1/2, shelf).

- **Mode 2 — Simulate:**  
  **Simulate**  
  Interactive cases: stems, vitals, labs, decision checkpoints, instant feedback, and branching next steps.

- **Mode 3 — Guideline:**  
  **Guideline**  
  Evidence-backed recommendations with strength of evidence, source, region, and how to apply to a case.

- **Closing line (optional):**  
  Choose your primary use when you sign up — we set the right default and turn on evidence for you.

**Visual direction**
- Three cards: same treatment as Section 2 — light border/shadow, hover lift. Number or icon (1–2–3 or A/S/G). Optional: short looping animation per card (e.g. chat bubble for Ask, branching path for Simulate, document for Guideline) — keep under 2s, subtle.
- **Animation:** Section fade-up; three cards stagger in (0, 100, 200ms). Optional: Simulate card has a very subtle “path” or “branch” draw on hover.

---

## Section 5 — For clinicians

**Layout:** Section label + headline. Six workflow modes in a 2×3 or 3×2 grid. One line title + one line description per tile. Optional: one hero screenshot (e.g. Clinical Summary or Drug Interactions).

**Copy**

- **Section label:**  
  FOR CLINICIANS

- **Headline:**  
  **The right output for the right task.**

- **Subline:**  
  Point-of-care modes so you get chart-ready structure and depth — with evidence and escalation when it matters.

- **Modes (title + line):**
  1. **Open Search** — Synthesize context, differentials, and next steps.
  2. **Clinical Summary** — One-liner, active problems, key data, plan.
  3. **Drug Interactions** — Pairs, mechanism, risk level, monitoring, alternatives.
  4. **Stewardship** — Empiric/targeted options, de-escalation, duration, culture follow-up.
  5. **ICD10 Codes** — Candidates with rationale and documentation tips.
  6. **Med Review** — Duplications, contraindications, interactions, deprescribing opportunities.

- **Safety line (under grid or in small block):**  
  Missing-data guardrails and explicit escalation (e.g. “call 911,” “go to ED”) — we don’t ship until safety benchmarks pass.

**Visual direction**
- Grid: minimal tiles; icon or number per mode. Hover: slight scale and border/glow. Optional: one tile “featured” with a small screenshot.
- **Animation:** Grid items stagger in (e.g. 6 items, 50–80ms apart). Optional: on scroll, a thin progress line or highlight that “connects” the six (e.g. left-edge accent that fills).

---

## Section 6 — Evidence & trust

**Layout:** Centered or two-column. Left: copy. Right: visual of citations (e.g. [1], [2] in text + reference list) or scorecard strip (citation coverage, escalation, etc.). Keep numbers and labels clear.

**Copy**

- **Section label:**  
  EVIDENCE & TRUST

- **Headline:**  
  **See what every claim is built on.**

- **Body:**  
  When you’re learning or practicing with AskFleming, answers can pull from live evidence: PubMed, guidelines (e.g. NICE), ClinicalTrials.gov, OpenFDA drug safety, and conflict detection when sources disagree. Every factual claim is cited inline — [1], [2] — so you can verify, not just trust.

- **Trust line:**  
  We don’t ship until our healthcare benchmark suite passes. Latest run: 100% escalation compliance, 89% citation coverage, 82% guideline hit rate, 4.8/5 overall and 4.9/5 safety.

- **CTA (text):**  
  How we measure quality →

**Visual direction**
- Citation mock: real-looking message with [1], [2] and a compact reference list; fade-in or typewriter-style for the numbers. Scorecard: 4–5 metrics in a slim horizontal strip or small cards; numbers can count up on scroll-into-view (optional).
- **Animation:** Section fade-up; citation example and scorecard stagger. Optional: numbers animate from 0 to value when in view (short duration, ease-out).

---

## Section 7 — Connectors (optional, compact)

**Layout:** One row of logos or names, or a compact grid. “Powered by” or “Evidence from” feel. No long copy.

**Copy**

- **Section label:**  
  EVIDENCE SOURCES

- **Line:**  
  PubMed · Guidelines (NICE, Europe PMC) · ClinicalTrials.gov · OpenFDA · Conflict detection · Scholar Gateway · bioRxiv · NPI Registry · CMS Coverage · ChEMBL · and more.

**Visual direction**
- Pills or small logo placeholders in a single row; wrap on small screens. Subtle hover state. Optional: gentle marquee or static row. Keep very minimal.

---

## Section 8 — Final CTA

**Layout:** Full-width or contained strip. One headline, one subline, one primary CTA. Background: solid or soft gradient; optional subtle pattern.

**Copy**

- **Headline:**  
  **From question to answer — with evidence you can see.**

- **Subline:**  
  Join medical students and clinicians who finish the work with AskFleming.

- **CTA:**  
  **[ Start free ]**

- **Secondary:**  
  Terms · Privacy · Design partner program

**Visual direction**
- Same CTA style as hero; optional softer background contrast. No heavy animation — simple fade or slight scale on CTA hover.

---

## Section order (summary)

| Order | Section              | Purpose                          |
|-------|----------------------|----------------------------------|
| 1     | Hero                 | Hook + primary CTA               |
| 2     | Who it’s for         | Orient: everyone / students / clinicians |
| 3     | For everyone         | General users: BYOK, multi-model, files, evidence |
| 4     | For medical students | Ask, Simulate, Guideline         |
| 5     | For clinicians       | Six workflow modes + safety      |
| 6     | Evidence & trust     | Citations, benchmarks, methodology |
| 7     | Evidence sources     | Connectors (optional, compact)   |
| 8     | Final CTA            | Convert + footer links           |

---

## Visual & animation checklist

- **Sleek hero:** Large, sparse headline; one subline; one CTA. Fade + light scale on load; optional drawing line or gradient blob.
- **Sections:** Fade-up on scroll; staggered children (50–200ms). One clear focal per section.
- **Cards/tiles:** Hover lift 2–4px, border or shadow; optional subtle icon animation (short loop).
- **Numbers:** Optional count-up when Evidence & trust section enters viewport.
- **Respect:** `prefers-reduced-motion: reduce` → disable or shorten animations; keep layout and copy unchanged.
- **Palette:** One dominant background (dark or light), one accent (e.g. blue or green), neutral text. High contrast for text and CTAs.

Use this doc as the single source for layout, copy, and sleek visual/animation direction for the AskFleming landing page.
