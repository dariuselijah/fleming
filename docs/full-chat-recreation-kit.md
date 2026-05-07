# Fleming Full Chat Recreation Kit (Exact UI + Prompts + Tools + Evidence)

This is the canonical blueprint to recreate Fleming chat with the same layout, input UX, tool-calling behavior, citations, and role-specific workflows for clinicians and medical students.

This version includes executable code (scripts + paste-ready files/snippets), not just file references.

## 1) Exact Clone Strategy

Use this as the operating rule:

- Same file set
- Same prompts
- Same runtime flags
- Same model/tool routing
- Same citation rendering contract
- Same role/mode behavior

## 1.1) Code Pack Export Script (Exact File Copy)

Run this from your Fleming repo root to export a drop-in pack for another codebase:

```bash
#!/usr/bin/env bash
set -euo pipefail

SRC_ROOT="$(pwd)"
OUT_DIR="${1:-./fleming-chat-code-pack}"

rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

rsync -a \
  "$SRC_ROOT/app/api/chat/route.ts" \
  "$SRC_ROOT/app/components/chat/" \
  "$SRC_ROOT/app/components/chat-input/" \
  "$SRC_ROOT/app/components/suggestions/" \
  "$SRC_ROOT/app/components/layout/" \
  "$SRC_ROOT/app/hooks/use-chat-draft.ts" \
  "$SRC_ROOT/app/page.tsx" \
  "$SRC_ROOT/app/c/[chatId]/page.tsx" \
  "$SRC_ROOT/app/globals.css" \
  "$SRC_ROOT/components/prompt-kit/" \
  "$SRC_ROOT/components/ui/" \
  "$SRC_ROOT/lib/evidence/" \
  "$SRC_ROOT/lib/citations/" \
  "$SRC_ROOT/lib/config.ts" \
  "$SRC_ROOT/lib/medical-student-learning.ts" \
  "$SRC_ROOT/lib/clinician-mode.ts" \
  "$SRC_ROOT/lib/models/healthcare-agents.ts" \
  "$SRC_ROOT/lib/chat-store/" \
  "$SRC_ROOT/lib/uploads/" \
  "$SRC_ROOT/lib/user-preference-store/" \
  "$SRC_ROOT/lib/user-store/" \
  "$SRC_ROOT/lib/model-store/" \
  "$SRC_ROOT/lib/models/" \
  "$SRC_ROOT/lib/routes.ts" \
  "$SRC_ROOT/package.json" \
  "$SRC_ROOT/.env.example" \
  "$OUT_DIR/"

echo "Export complete: $OUT_DIR"
```

## 1.2) Import Alias + Next Setup (Paste Into Target Repo)

### `tsconfig.json` (minimum needed for `@/` imports)

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./*"]
    }
  }
}
```

### `next.config.ts` (if missing)

```ts
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  experimental: {
    reactCompiler: false,
  },
}

export default nextConfig
```

## 1.3) Paste-Ready Core Files

### `app/page.tsx`

```tsx
import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"
import type { Metadata } from "next"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "AskFleming - Evidence-Based Medical AI | Start Chatting Now",
  description:
    "Start chatting with AskFleming and get evidence-based medical answers with peer-reviewed citations.",
}

export default function Home() {
  return (
    <MessagesProvider>
      <LayoutApp>
        <ChatContainer />
      </LayoutApp>
    </MessagesProvider>
  )
}
```

### `app/c/[chatId]/page.tsx`

```tsx
import { ChatContainer } from "@/app/components/chat/chat-container"
import { LayoutApp } from "@/app/components/layout/layout-app"
import { MessagesProvider } from "@/lib/chat-store/messages/provider"
import { isSupabaseEnabled } from "@/lib/supabase/config"
import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export default async function Page() {
  if (isSupabaseEnabled) {
    const supabase = await createClient()
    if (supabase) {
      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError || !userData?.user) redirect("/")
    }
  }

  return (
    <MessagesProvider>
      <LayoutApp>
        <ChatContainer />
      </LayoutApp>
    </MessagesProvider>
  )
}
```

### `app/components/layout/layout-app.tsx`

```tsx
"use client"

import { Header } from "@/app/components/layout/header"
import { AppSidebar } from "@/app/components/layout/sidebar/app-sidebar"
import { useUserPreferences } from "@/lib/user-preference-store/provider"

export function LayoutApp({ children }: { children: React.ReactNode }) {
  const { preferences } = useUserPreferences()
  const hasSidebar = preferences.layout === "sidebar"

  return (
    <div className="bg-background flex h-dvh w-full overflow-hidden">
      {hasSidebar && <AppSidebar />}
      <main className="@container relative h-dvh w-0 flex-shrink flex-grow overflow-y-auto">
        <Header hasSidebar={hasSidebar} />
        {children}
      </main>
    </div>
  )
}
```

## 1.4) Tool Registry Code Snippet (From Live Chat Route)

Use this shape in your API route to preserve tool-call parity:

```ts
const runtimeTools: ToolSet = {
  uploadContextSearch: tool(/* zod schema + execute */),
  inspectUploadStructure: tool(/* ... */),
  refineQuizRequirements: tool(/* ... */),
  refineArtifactRequirements: tool(/* ... */),
  generateQuizFromUpload: tool(/* ... */),
  pubmedSearch: tool(/* ... */),
  pubmedLookup: tool(/* ... */),
  guidelineSearch: tool(/* ... */),
  clinicalTrialsSearch: tool(/* ... */),
  drugSafetyLookup: tool(/* ... */),
  evidenceConflictCheck: tool(/* ... */),
  scholarGatewaySearch: tool(/* ... */),
  bioRxivSearch: tool(/* ... */),
  bioRenderSearch: tool(/* ... */),
  npiRegistrySearch: tool(/* ... */),
  synapseSearch: tool(/* ... */),
  cmsCoverageSearch: tool(/* ... */),
  chemblSearch: tool(/* ... */),
  benchlingSearch: tool(/* ... */),
  youtubeSearch: tool(/* ... */),
  webSearch: tool(/* ... */),
}
```

## 1.5) Connector IDs (Exact Type Union)

Paste this into your target evidence connector typing:

```ts
export type ClinicalConnectorId =
  | "pubmed"
  | "guideline"
  | "clinical_trials"
  | "scholar_gateway"
  | "biorxiv"
  | "biorender"
  | "npi_registry"
  | "synapse"
  | "cms_coverage"
  | "chembl"
  | "benchling"
```

## 2) Core App Entry + Layout

Copy these exact files:

- `app/page.tsx`
- `app/c/[chatId]/page.tsx`
- `app/components/layout/layout-app.tsx`
- `app/components/layout/header.tsx`
- `app/components/chat/chat-container.tsx`
- `app/components/chat/chat.tsx`

These files define:

- Home vs chat route rendering
- Header and sidebar-aware app shell
- Onboarding-state chat layout
- Fixed top header with centered chat area
- Input placement (`home` prompt center vs `chat` bottom compose)

## 3) Exact Input + Composer UX

Copy:

- `app/components/chat-input/chat-input.tsx`
- `app/components/chat-input/learning-mode-selector.tsx`
- `app/components/chat-input/clinician-mode-selector.tsx`
- `app/components/chat-input/clinician-workflow-panel.tsx`
- `app/components/chat-input/button-file-upload.tsx`
- `app/components/chat-input/button-search.tsx`
- `app/components/chat-input/saved-clinician-questions.tsx`
- `app/components/chat-input/saved-clinician-questions-dialog.tsx`
- `app/components/suggestions/prompt-system.tsx`
- `components/prompt-kit/prompt-input.tsx`

Feature parity covered:

- Autosizing textarea
- Enter-to-send, Shift+Enter newline
- Stop button while streaming
- Slash upload picker (`/` quick reference)
- Upload reference chips
- File upload chips + status
- Model selector + search toggle
- Clinician workflow tabs
- Medical student learning modes (`ask`, `simulate`, `guideline`)
- Artifact intent detection (quiz)

## 4) Exact Conversation + Response Rendering

Copy:

- `app/components/chat/conversation.tsx`
- `app/components/chat/message.tsx`
- `app/components/chat/message-user.tsx`
- `app/components/chat/message-assistant.tsx`
- `app/components/chat/assistant-inline-parts.tsx`
- `app/components/chat/activity/activity-timeline.tsx`
- `app/components/chat/activity/build-timeline.ts`
- `app/components/chat/activity/types.ts`
- `app/components/chat/tool-invocation.tsx`
- `app/components/chat/trust-summary-card.tsx`
- `app/components/chat/generated-artifact-cards.tsx`
- `app/components/chat/learning-card.tsx`
- `app/components/chat/youtube-results.tsx`
- `app/components/chat/search-images.tsx`

This preserves:

- Timeline-style assistant output
- Streaming intro previews
- Artifact cards (document + interactive quiz)
- YouTube and media result rendering
- Trust summary card
- Copy/regenerate controls

## 5) Exact Citation + Evidence UI

Copy:

- `app/components/chat/citation-markdown.tsx`
- `app/components/chat/evidence-citation-pill.tsx`
- `app/components/chat/evidence-references-section.tsx`
- `app/components/chat/references-section.tsx`
- `app/components/chat/journal-citation-tag.tsx`
- `app/components/chat/citation-popup.tsx`
- `app/components/chat/citation-utils.ts`
- `app/components/chat/source-appendix.ts`
- `lib/citations/parser.ts`
- `lib/citations/formatters.ts`

Important behavior preserved:

- Supports `[1]`, `[1-3]`, `[PMID:123]`, `[CITATION:1]`, named markers, symbolic markers
- Converts unresolved internal tags to safe output
- Inline evidence pills for evidence mode
- Reference sections and trust summaries

## 6) Exact Chat Runtime + Persistence

Copy:

- `app/components/chat/use-chat-core.ts`
- `app/components/chat/use-chat-operations.ts`
- `app/components/chat/use-file-upload.ts`
- `app/components/chat/use-model.ts`
- `app/hooks/use-chat-draft.ts`
- `lib/chat-store/messages/provider.tsx`
- `lib/chat-store/messages/api.ts`
- `lib/chat-store/messages/session-restore.ts`
- `lib/chat-store/chats/provider.tsx`
- `lib/chat-store/session/provider.tsx`

Critical runtime features:

- Streaming state + optimistic appends
- Header-based evidence citation ingestion (`X-Evidence-Citations`)
- Chat id handoff (`temp-chat-*` -> persistent id)
- SessionStorage/IndexedDB message survival during route transitions
- Incremental save during streaming + final save on finish

## 7) Backend Route + Tool Calls (Source of Truth)

Copy:

- `app/api/chat/route.ts`

Exact runtime tools currently wired in this route:

- `uploadContextSearch`
- `inspectUploadStructure`
- `refineQuizRequirements`
- `refineArtifactRequirements`
- `generateQuizFromUpload`
- `pubmedSearch`
- `pubmedLookup`
- `guidelineSearch`
- `clinicalTrialsSearch`
- `drugSafetyLookup`
- `evidenceConflictCheck`
- `scholarGatewaySearch`
- `bioRxivSearch`
- `bioRenderSearch`
- `npiRegistrySearch`
- `synapseSearch`
- `cmsCoverageSearch`
- `chemblSearch`
- `benchlingSearch`
- `youtubeSearch`
- `webSearch`

For exact schemas and execution behavior, use `app/api/chat/route.ts` directly (tool params are zod-defined there).

## 8) Evidence + Connector Backend (Exact)

Copy:

- `lib/evidence/index.ts`
- `lib/evidence/types.ts`
- `lib/evidence/search.ts`
- `lib/evidence/synthesis.ts`
- `lib/evidence/live-tools.ts`
- `lib/evidence/provenance.ts`
- `lib/evidence/connectors/types.ts`
- `lib/evidence/connectors/registry.ts`
- `lib/evidence/connectors/index.ts`
- `lib/evidence/guidelines/**/*`

Connector IDs (canonical):

- `pubmed`
- `guideline`
- `clinical_trials`
- `scholar_gateway`
- `biorxiv`
- `biorender`
- `npi_registry`
- `synapse`
- `cms_coverage`
- `chembl`
- `benchling`

## 9) Role Prompts (Clinician + Medical Student + General)

Copy prompts from:

- `lib/config.ts`
- `lib/models/healthcare-agents.ts`
- `docs/system-prompts.md` (documentation mirror)

Primary prompt constants in `lib/config.ts`:

- `SYSTEM_PROMPT_DEFAULT`
- `MEDICAL_STUDENT_SYSTEM_PROMPT`
- `CLINICIAN_WEB_SYSTEM_PROMPT`
- `FLEMING_4_SYSTEM_PROMPT`
- `FLEMING_IMAGE_ANALYSIS_PROMPT`
- `WEB_ROLE_SHARED_OUTPUT_FORMATTING_STYLE`

Role selector logic:

- `getSystemPromptByRole(role, customPrompt?)`

Healthcare agent prompts (specialized):

- orchestrator
- clinical diagnosis
- evidence-based medicine
- drug interaction
- imaging interpretation
- laboratory analysis
- treatment planning
- risk assessment
- specialty consultant

## 10) Clinician + Med Student Feature Parity Files

Copy:

- `lib/medical-student-learning.ts`
- `lib/clinician-mode.ts`
- `app/components/layout/settings/general/user-role-selection.tsx`
- `app/components/layout/settings/healthcare/healthcare-settings.tsx`
- `app/components/layout/settings/healthcare/healthcare-agent-selector.tsx`

This preserves:

- Role-based prompt/UX switching
- Learning mode UX
- Clinician workflow modes
- Healthcare settings and agent selection

## 11) Exact Styling Layer

Copy:

- `app/globals.css`
- `app/components/chat/markdown-styles.ts`
- `components/prompt-kit/markdown.tsx`
- `components/prompt-kit/message.tsx`
- `components/prompt-kit/chat-container.tsx`
- `components/prompt-kit/processing-loader.tsx`
- `components/prompt-kit/scroll-button.tsx`
- `components/ui/**/*` (required by prompt-kit/chat controls)

Key style contract:

- Tailwind v4 tokens in `app/globals.css`
- `WEB_ROLE_MARKDOWN_CLASSNAME` in `app/components/chat/markdown-styles.ts`
- Prompt input shell uses `rounded-3xl`, border, backdrop blur, compact action row

## 12) Required Runtime Flags

Ensure these are enabled (from `.env.example` / `lib/config.ts`):

```env
ENABLE_WEB_SEARCH_TOOL=true
ENABLE_LANGGRAPH_HARNESS=true
ENABLE_CONNECTOR_REGISTRY=true
ENABLE_STRICT_CITATION_CONTRACT=true
ENABLE_CHAT_ACTIVITY_TIMELINE_V2=true
ENABLE_YOUTUBE_TOOL=true
NEXT_PUBLIC_ENABLE_UPLOAD_CONTEXT_SEARCH=true
UPLOAD_ARTIFACT_V2=true
```

`BENCH_STRICT_MODE` is optional for strict benchmark mode.

## 13) One-Shot Copy Manifest Script

Use this to export an exact chat bundle into another app workspace:

```bash
mkdir -p ./fleming-chat-clone

rsync -a \
  app/api/chat/route.ts \
  app/components/chat/ \
  app/components/chat-input/ \
  app/components/suggestions/ \
  app/components/layout/ \
  app/hooks/use-chat-draft.ts \
  app/page.tsx \
  app/c/[chatId]/page.tsx \
  app/globals.css \
  components/prompt-kit/ \
  components/ui/ \
  lib/evidence/ \
  lib/citations/ \
  lib/config.ts \
  lib/medical-student-learning.ts \
  lib/clinician-mode.ts \
  lib/models/healthcare-agents.ts \
  lib/chat-store/ \
  lib/uploads/ \
  lib/user-preference-store/ \
  lib/user-store/ \
  lib/model-store/ \
  lib/models/ \
  lib/routes.ts \
  package.json \
  .env.example \
  ./fleming-chat-clone/
```

## 14) Validation Checklist (Must Pass for “Exact”)

- Chat opens with centered onboarding composer on home, bottom composer in thread
- Streaming starts immediately with intro preview
- Stop button appears during stream
- Evidence citations render inline as pills
- References + trust summary cards appear on ready state
- Tool invocations appear in activity timeline
- Upload context search and artifact quiz flow work
- Clinician modes + saved clinician questions work
- Med student modes (`ask/simulate/guideline`) work
- Header role state and settings switch prompt behavior

## 15) Practical Note

For true parity, copy these files as-is first, then adapt imports to the new app shell. Rewriting this stack from scratch will miss subtle behaviors (streaming persistence, citation restoration, mode coupling, artifact fallback flows).

## 16) Generate Full Source Dump Markdown (All Code In One File)

If you want one giant markdown with actual source code blocks (instead of path references), run:

```bash
#!/usr/bin/env bash
set -euo pipefail

OUT_FILE="${1:-./FULL_CHAT_SOURCE_DUMP.md}"
ROOT="$(pwd)"

FILES=(
  "app/page.tsx"
  "app/c/[chatId]/page.tsx"
  "app/api/chat/route.ts"
  "app/components/chat/chat.tsx"
  "app/components/chat/conversation.tsx"
  "app/components/chat/message.tsx"
  "app/components/chat/message-assistant.tsx"
  "app/components/chat/citation-markdown.tsx"
  "app/components/chat/use-chat-core.ts"
  "app/components/chat-input/chat-input.tsx"
  "app/globals.css"
  "lib/config.ts"
  "lib/evidence/connectors/types.ts"
  "lib/evidence/connectors/registry.ts"
  "lib/medical-student-learning.ts"
  "lib/clinician-mode.ts"
  "lib/models/healthcare-agents.ts"
)

{
  echo "# Full Chat Source Dump"
  echo
  echo "Generated from: $ROOT"
  echo
  for f in "${FILES[@]}"; do
    if [[ -f "$ROOT/$f" ]]; then
      ext="${f##*.}"
      lang="$ext"
      [[ "$ext" == "tsx" ]] && lang="tsx"
      [[ "$ext" == "ts" ]] && lang="ts"
      [[ "$ext" == "css" ]] && lang="css"
      echo "## \`$f\`"
      echo
      echo "\`\`\`$lang"
      sed -e 's/\t/  /g' "$ROOT/$f"
      echo "\`\`\`"
      echo
    fi
  done
} > "$OUT_FILE"

echo "Wrote $OUT_FILE"
```

This gives your other codebase team a single markdown containing concrete source code blocks they can copy directly.

