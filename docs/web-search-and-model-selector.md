# Web Search and Model Selector Governance

## Web Search Gating

- Web search is opt-in per message flow.
- Search runs only when the user enables the Search toggle in the chat input (blue state).
- Backend enforces this via `enableSearch === true` and `ENABLE_WEB_SEARCH_TOOL !== "false"`.

## Search Execution Path

- Primary path uses explicit Exa-backed retrieval (`lib/web-search.ts`).
- Chat route performs:
  - deterministic preflight search (time-budgeted),
  - optional `webSearch` runtime tool registration,
  - fallback to normal answer flow if no results are available.
- Provider-native web search is disabled for deterministic behavior and predictable citations.

## Default and Favorite Models

- Default model remains `fleming-4`.
- Default favorite ordering is:
  1. `fleming-4`
  2. `gpt-5.2`
  3. `gemini-2.5-flash`
- Favorite ordering is preserved deterministically in selectors.

## Frontier Model Refresh Workflow

- Run:
  - `npm run models:refresh-frontier`
- The script checks expected frontier IDs in provider model registry files and writes:
  - `data/eval/frontier-model-refresh-report.json`
- Refresh process:
  1. Run script.
  2. Review missing IDs and reference URL reachability.
  3. Update model registry files and provider type maps.
  4. Re-run script and confirm no missing IDs.
