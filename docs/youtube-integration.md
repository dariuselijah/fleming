# YouTube Integration

This document describes the conditional YouTube tool integration used by chat.

## Goals

- Only search YouTube when the user intent is clearly video/tutorial-oriented.
- Return educational video results with thumbnails for in-chat rendering.
- Keep quota usage predictable and low.
- Avoid treating YouTube as primary clinical evidence.

## Configuration

Set these environment variables:

- `YOUTUBE_API_KEY`: YouTube Data API v3 key.
- `ENABLE_YOUTUBE_TOOL`: server-side feature gate. Default behavior is enabled unless explicitly set to `false`.

Reference values are documented in `.env.example`.

## Runtime Behavior

The route-level gating logic in `app/api/chat/route.ts` enables the `youtubeSearch` tool only when:

1. tool-capable model is active,
2. server feature flag is enabled,
3. search is enabled for the current request,
4. query has clear video/tutorial intent.

Emergency contexts suppress YouTube by default unless the user explicitly requests training videos.

## API Strategy

Implementation is in `lib/youtube.ts` using official YouTube Data API v3 only:

- Primary call: `search.list` (`type=video`, `part=snippet`).
- Secondary enrichment: `videos.list` (`contentDetails`, `statistics`) for duration/views.
- Partial response filtering with `fields` to reduce payload.
- Safe defaults (`safeSearch=strict`, bounded `maxResults`).
- Retry/timeout handling for transient failures.
- In-memory TTL cache to reduce repeated quota spend.

## Ranking Policy (Hybrid)

Results are ranked using:

- lexical relevance to query,
- trusted medical channel boosts,
- educational signal boost (tutorial/demo wording),
- medical relevance score,
- recency/popularity secondary boosts.

If strict medical filtering returns no hits, the system returns best general matches and includes a warning.

## UI Rendering

YouTube tool results are displayed in two places:

- Inline assistant content cards with thumbnail previews (`app/components/chat/youtube-results.tsx`).
- Tool invocation detail panel with thumbnail-aware renderer (`app/components/chat/tool-invocation.tsx`).

Cards are only shown when `youtubeSearch` returns results.

## Safety and Evidence Positioning

- YouTube is an educational adjunct, not a citation-grade evidence source.
- System prompt guidance explicitly instructs the model not to use videos as primary clinical evidence for diagnosis/treatment claims.
- Evidence citation pipeline remains separate.
