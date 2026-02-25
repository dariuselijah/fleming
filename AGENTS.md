# AGENTS.md

## Cursor Cloud specific instructions

### Overview

AskFleming is a Next.js 15 AI-powered medical chat application. It uses npm as its package manager (`package-lock.json`).

### Key commands

| Task | Command |
|------|---------|
| Dev server | `npm run dev` (uses Turbopack) |
| Lint | `npm run lint` |
| Type check | `npm run type-check` |
| Build | `npm run build` |

See `package.json` for additional scripts (ingestion, monitoring).

### Environment setup

- Copy `.env.example` to `.env.local` and fill in values. At minimum, generate `CSRF_SECRET` and `ENCRYPTION_KEY` (see `INSTALL.md` for commands).
- The app gracefully degrades without Supabase (`isSupabaseEnabled` in `lib/supabase/config.ts` checks for `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
- Without any AI API keys, the UI loads and works but chat submissions return an API key error. Set at least one AI provider key (e.g. `OPENAI_API_KEY`) to enable chat.
- Set `DISABLE_OLLAMA=true` in `.env.local` to avoid Ollama connection attempts when no local Ollama instance is available.

### Dev server notes

- The dev server runs on port 3000 with Turbopack (`npm run dev`).
- Health endpoint: `GET /api/health` returns `{"status":"ok"}`.
- ESLint has pre-existing warnings/errors in the codebase (beta project). `next.config.ts` sets `eslint.ignoreDuringBuilds: true` so lint issues do not block builds.
- `npm run type-check` passes cleanly.
