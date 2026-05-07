# Tools & integrations map (Fleming)

This document maps **model-callable chat tools**, **backend connectors/registries**, **student-workspace APIs**, and **candidate platforms** for medical students and clinicians. Implementation notes reflect the codebase as of the last update to this file.

---

## 1. How tools are wired

| Layer | Role |
|--------|------|
| **`app/api/chat/route.ts`** | Builds the AI SDK `ToolSet` (`runtimeTools`): evidence tools, connector tools, YouTube, web search; merges orchestration hints from LangChain supervisor or LangGraph harness. |
| **`lib/evidence/connectors/registry.ts`** | Clinical connector adapters used by `runConnectorSearch` (and indirectly by connector **tools** via `executeConnectorWithFallback`). |
| **`lib/health-connectors/*`** | Separate product surface: catalog + OAuth/connect/sync for wearables and FHIR-style records (`app/api/health-connectors/*`). **Not** the same registry as chat connector tools. |
| **`lib/plugins/*`** | Student LMS plugins (Canvas/Moodle sync into uploads + `student_lms_*` tables). **Not** exposed as named LLM tools; data can enter chat via uploads + optional LMS preflight context. |
| **Feature flags** | `lib/config.ts` — see §5. |

**Gating (high level)**

- **Evidence tools** (`shouldEnableEvidenceTools`): `finalEnableEvidence` (clinician/student roles, client flag, or evidence-seeking intent) **and** model supports tools **and** non-empty query.
- **Artifact / upload tools**: `ENABLE_UPLOAD_CONTEXT_SEARCH`, authenticated user, model supports tools; quiz workflow also depends on `ENABLE_UPLOAD_ARTIFACT_V2` and stage gates (`inspect` / `refine` / `generate`).
- **Connector tools**: `ENABLE_CONNECTOR_REGISTRY` **and** same base condition as evidence tools.
- **Web search**: `ENABLE_WEB_SEARCH_TOOL`, `EXA_API_KEY` (via `hasWebSearchConfigured()`), not suppressed by upload-preference routing.
- **YouTube**: `ENABLE_YOUTUBE_TOOL` + intent classifier (`youtubeIntentDecision.shouldUse`).

---

## 2. Chat model tools (AI SDK) — inventory & implementation

Primary definition: `app/api/chat/route.ts` (`evidenceRuntimeTools`, `connectorRuntimeTools`, `youtubeRuntimeTools`, `webSearchRuntimeTools`).

| Tool name | Purpose | Implementation status |
|-----------|---------|-------------------------|
| **uploadContextSearch** | Page/topic-aware search over user uploads | **Live** — `UserUploadService.uploadContextSearch` (requires auth). Gated by `ENABLE_UPLOAD_CONTEXT_SEARCH`. |
| **inspectUploadStructure** | TOC / headings / topic map for large uploads | **Live** — when `ENABLE_UPLOAD_ARTIFACT_V2` + artifact workflow in `inspect` stage. |
| **refineQuizRequirements** | Narrow quiz scope before generation | **Live** — quiz + `refine` stage gates. |
| **refineArtifactRequirements** | Broader artifact refinement | **Live** — same family, stage-gated. |
| **generateQuizFromUpload** | Generate quiz from upload content | **Live** — `generate` stage + inspection gates. |
| **generateTimetableFromUploads** | Timetable-style plan from uploads | **Live** — gated like other artifact tools. |
| **rebuildStudyGraphFromUpload** | Rebuild study graph from material | **Live** — gated. |
| **rebalanceTimetablePlan** | Rebalance an existing plan | **Live** — gated. |
| **createReviewQueueFromUploads** | Spaced-repetition style queue from uploads | **Live** — gated. |
| **summarizeLectureUpload** | Lecture/transcript-oriented summary | **Live** — gated; uses upload metadata / extraction paths. |
| **pubmedSearch** | PubMed literature search | **Live** — `searchPubMed` + relevance filter + provenance. |
| **pubmedLookup** | Fetch article by PMID | **Live** — `fetchPubMedArticle`. |
| **guidelineSearch** | Guidelines (adapter registry; US + optional global fallback) | **Live** — `searchGuidelines` from `lib/evidence/live-tools`. |
| **clinicalTrialsSearch** | ClinicalTrials.gov v2 | **Live** — `searchClinicalTrials`. |
| **drugSafetyLookup** | Drug safety / interactions / renal notes | **Live** — `lookupDrugSafety` (OpenFDA-oriented implementation in `live-tools`). |
| **evidenceConflictCheck** | Contradiction check across statements | **Live** — `detectEvidenceConflicts`. |
| **scholarGatewaySearch** | Scholarly / broad literature signals | **Live** — `runConnectorSearch` → `scholar_gateway`; may **extra-gate** off unless explicit intent or sparse citations (`allowScholarGatewayTool`). |
| **bioRxivSearch** | Preprints | **Live** — connector `biorxiv` (API + optional web fallback). |
| **bioRenderSearch** | BioRender-scoped web search | **Registry enabled: false** — adapter disabled; tool may return empty/disabled behavior unless changed. |
| **npiRegistrySearch** | US NPI Registry | **Live** — direct API in registry. |
| **synapseSearch** | Synapse datasets | **Registry enabled: false** — web-scoped stub path when enabled at tool level; adapter `enabled()` is false. |
| **cmsCoverageSearch** | CMS coverage / LCD / NCD | **Live** — API + optional web fallback. |
| **chemblSearch** | ChEMBL molecules | **Live** — direct API in registry. |
| **benchlingSearch** | Benchling lab context | **Registry enabled: false** — web-scoped path; adapter disabled. |
| **youtubeSearch** | YouTube video search | **Live** when intent allows — `searchYouTubeVideos`. |
| **webSearch** | General web search | **Live** — `searchWeb` (Exa-backed when configured). |

**Note:** `shouldEnablePubMedTools` is computed for routing/diagnostics; the **PubMed tools remain inside** `evidenceRuntimeTools` whenever `shouldEnableEvidenceTools` is true (not removed by that variable alone). Planner/harness may still prioritize fan-out lists.

---

## 3. Orchestration (not separate callable tools)

| Mechanism | Status | Notes |
|-----------|--------|--------|
| **LangChain supervisor** | **Live** (for `medical_student` / `doctor`) when `ENABLE_LANGCHAIN_SUPERVISOR` | Picks connector order and tool hints; receives optional **`lmsContext`** snapshot. |
| **LangGraph clinical harness** | **Live** when `ENABLE_LANGGRAPH_HARNESS` | Fallback if supervisor unavailable or not used. |
| **LMS context preflight** | **Live** for **medical students** when query has educational cues (non-`ask` mode or pattern match) | `loadMinimalLmsContextSnapshot` reads `student_lms_courses` / `student_lms_artifacts` — **not** an LLM tool, but informs routing. |
| **Evidence synthesis preflight** | **Live** | `synthesizeEvidence` before stream (time-budgeted). |
| **Upload context preflight** | **Live** | Parallel preflight for RAG when upload context is preferred. |
| **Study graph context preflight** | **Live** | `StudyGraphService.searchNodes` when upload context preferred. |

---

## 4. Clinical connector registry (backend)

Defined in `lib/evidence/connectors/types.ts` and `registry.ts`. Maps to chat tool names via `CONNECTOR_TOOL_NAME_MAP` in `lib/clinical-agent/graph/types.ts`.

| Connector ID | Adapter implementation | `enabled()` | Typical tool |
|--------------|-------------------------|-------------|--------------|
| `pubmed` | PubMed search | always | *(direct tools: pubmedSearch/Lookup, not only registry)* |
| `guideline` | Guideline adapters | always | guidelineSearch |
| `clinical_trials` | ClinicalTrials.gov | always | clinicalTrialsSearch |
| `scholar_gateway` | Native API + web fallback | always | scholarGatewaySearch |
| `biorxiv` | API + web fallback | always | bioRxivSearch |
| `biorender` | Web-scoped | **false** | bioRenderSearch |
| `npi_registry` | CMS NPI API | always | npiRegistrySearch |
| `synapse` | Web-scoped | **false** | synapseSearch |
| `cms_coverage` | CMS API + web fallback | always | cmsCoverageSearch |
| `chembl` | EBI API | always | chemblSearch |
| `benchling` | Web-scoped | **false** | benchlingSearch |

Reliability: retries, circuit breaker, degradation metrics (`withReliabilityGuard`).

---

## 5. Feature flags (`lib/config.ts`)

| Flag | Effect |
|------|--------|
| `NEXT_PUBLIC_ENABLE_UPLOAD_CONTEXT_SEARCH` | Upload RAG + upload tool availability |
| `UPLOAD_ARTIFACT_V2` | Structure inspection + richer artifact workflow |
| `ENABLE_YOUTUBE_TOOL` | YouTube tool |
| `ENABLE_WEB_SEARCH_TOOL` | Web search tool + preflight |
| `ENABLE_LANGGRAPH_HARNESS` | Clinical harness planning |
| `ENABLE_LANGCHAIN_SUPERVISOR` | LangChain supervisor planning |
| `ENABLE_COGNITIVE_ORCHESTRATION_FULL` | Incomplete-evidence policy depth |
| `ENABLE_CONNECTOR_REGISTRY` | Scholar/NPI/CMS/ChEMBL/bioRxiv/BioRender/Synapse/Benchling **tools** |
| `ENABLE_STRICT_CITATION_CONTRACT` | Stricter citation behavior in prompts |
| `ENABLE_CHAT_ACTIVITY_TIMELINE_V2` | Activity timeline UI |
| `NEXT_PUBLIC_ENABLE_CHART_DRILLDOWN_SUBLOOP` | Chart drill-down |

---

## 6. Student workspace — plugins & APIs (mostly outside LLM tool list)

### 6.1 Student plugin catalog (`lib/plugins/catalog.ts`)

| Plugin ID | Category | Sync / connect implementation |
|-----------|----------|--------------------------------|
| `lms_canvas` | LMS | **Real** — Canvas API client + `syncLmsPlugin` → uploads + DB. |
| `lms_moodle` | LMS | **Real** — Moodle REST client + same pipeline. |
| `calendar_google` | Calendar | **Stub sync** — connect checks env; `runPluginSync` returns placeholder counts (no Google Calendar API sync in that path). |
| `literature_pubmed` | Literature | **Stub sync** — placeholder counts; real PubMed is via **chat tools**, not this plugin sync. |
| `speech_ocr_pipeline` | Speech/OCR | **Stub sync** — placeholder; media pipeline may exist elsewhere for uploads. |

APIs: `app/api/student-workspace/plugins/{catalog,status,connect,sync,library}/route.ts`.

### 6.2 Other student-workspace HTTP APIs

| Area | Routes (examples) | Role |
|------|-------------------|------|
| Study graph | `study-graph` | Nodes/edges, extraction POST |
| Planner | `planner`, `planner/generate`, `planner/[planId]`, `rebalance`, `calendar-export` | Plans and blocks |
| Review | `review/due`, `generate`, `grade`, `stats` | Spaced repetition style |
| Parser | `parser/preview` | Document preview |

These power the **Student Workspace UI** and data model; only a subset of behavior is mirrored inside **chat tools** (e.g. study graph preflight, timetable/review **tools**).

---

## 7. Health connectors catalog (`lib/health-connectors/catalog.ts`)

Product catalog entries (connect/sync via `app/api/health-connectors/*`). **Not** the same as §4 clinical connector tools.

### 7.1 Evidence (overlaps conceptually with chat)

PubMed, guideline, clinical_trials, openfda (catalog entry), scholar_gateway, biorxiv, npi_registry, cms_coverage, chembl, synapse, benchling, biorender — various `live` / `beta` **availability labels** in catalog; actual chat surfacing is still governed by §2–§4.

### 7.2 Wearables (OAuth2 / OAuth1a)

Fitbit, Oura, WHOOP, Withings, Polar, Garmin — **beta** in catalog; implemented at health-connector API layer (env-dependent).

### 7.3 Medical records / FHIR-style

SMART on FHIR: Epic, Cerner, athenahealth; aggregators: 1upHealth, Health Gorilla, Redox, Particle — **beta** in catalog.

### 7.4 Native mobile (catalog only / coming soon)

Apple HealthKit, Android Health Connect, Samsung Health — **coming_soon** with stated need for native apps/partner programs.

---

## 8. Possible future integrations (by audience)

Below are **common** systems not necessarily present as code today. Use for roadmap / partnership planning.

### 8.1 Medical students

| Domain | Examples | Why |
|--------|----------|-----|
| **LMS / learning** | Blackboard, D2L Brightspace, Sakai, Schoology | Same pattern as Canvas/Moodle (course content + deadlines). |
| **Question banks** | UWorld, AMBOSS, Pastest, TrueLearn | QBANK APIs are rare; usually export or official partner APIs. |
| **Flashcards** | AnkiWeb, Quizlet (where API/policy allows) | Sync decks due dates with review queue. |
| **Scheduling** | Google Calendar (full CRUD), Outlook Calendar | Export already described in catalog; two-way sync is a gap. |
| **Note-taking** | Notion, Obsidian (local), OneNote | File export or API where available. |
| **Video learning** | Osmosis, Boards & Beyond, Lecturio | Typically licensed embeds; deep integration needs vendor deals. |
| **Collaboration** | Slack, Discord, Microsoft Teams | Notifications and study group scheduling. |
| **Reference managers** | Zotero, Mendeley, EndNote | Citation graph for evidence-linked study nodes. |

### 8.2 Clinicians

| Domain | Examples | Why |
|--------|----------|-----|
| **Point-of-care reference** | UpToDate, DynaMed, BMJ Best Practice, Lexicomp | Institutional SSO / licensed APIs or scraping prohibitions — usually B2B. |
| **EHR (beyond SMART)** | Meditech, eClinicalWorks, Veradigm | FHIR R4 + SMART is the scalable path; custom per site. |
| **E-prescribing / interaction** | First Databank, Micromedex, RxNorm / open prescribers | Drug tool today uses OpenFDA-oriented paths; richer checks need licensing. |
| **Imaging / PACS** | DICOMweb, local VNA | Radiology workflows; heavy compliance. |
| **Lab systems** | Epic Beaker, Cerner PowerChart interfaces | Often through aggregator (Redox, Health Gorilla) already in catalog. |
| **Billing / coding** | ICD-10-CM APIs, CPT (AMA licensed) | Administrative; distinct from evidence chat. |
| **Registries & quality** | NHS NICE CKS, specialty society APIs | Region-specific guideline depth. |
| **Telehealth** | Zoom Health, Doxy.me | Scheduling links, not clinical reasoning. |
| **Research** | ClinicalTrials.gov (done), WHO ICTRP, EU CTIS | Trial awareness for clinicians. |

### 8.3 Shared (students + clinicians)

| Domain | Examples |
|--------|----------|
| **Literature** | Europe PMC, Semantic Scholar, OpenAlex, Crossref — extend connector registry. |
| **Preprints** | medRxiv (pair with bioRxiv client patterns). |
| **General search** | Additional web search providers; medical vertical search. |
| **Identity / org** | SAML/OIDC for institutions; Google Workspace / Microsoft 365 directory. |

---

## 9. Quick reference — file locations

| Concern | Path |
|---------|------|
| Chat tool definitions | `app/api/chat/route.ts` |
| Clinical connector registry | `lib/evidence/connectors/registry.ts`, `types.ts` |
| Connector ↔ tool name map | `lib/clinical-agent/graph/types.ts` (`CONNECTOR_TOOL_NAME_MAP`) |
| LangChain supervisor | `lib/clinical-agent/langchain/supervisor.ts` |
| LangGraph harness | `lib/clinical-agent/graph/harness.ts` |
| Drug / trials / guidelines helpers | `lib/evidence/live-tools.ts` |
| Student plugins | `lib/plugins/server.ts`, `lms-sync.ts`, `catalog.ts` |
| Health connector catalog | `lib/health-connectors/catalog.ts` |
| Health connector APIs | `app/api/health-connectors/*/route.ts` |
| Student workspace APIs | `app/api/student-workspace/**/route.ts` |
| Feature flags | `lib/config.ts` |

---

*Generated for internal planning. Update this file when adding tools, connectors, or catalogs.*
