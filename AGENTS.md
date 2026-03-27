# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Mango Studio is a Next.js 16 (App Router, Turbopack) web-based video editor with AI-assisted editing, multi-track timeline, effects, transitions, speed ramping, and audio support. Single service: the Next.js dev server (`npm run dev` on port 3000).

### Running the app

- **Dev server**: `npm run dev` (port 3000)
- The app requires a `.env.local` file with at least placeholder Supabase values to start, because the middleware (`middleware.ts`) calls `createServerClient` and crashes without them:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://placeholder.supabase.co
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder
  ```
- With placeholder values the app loads but auth features won't work; the AuthModal shows and the editor is blurred behind it.
- For full functionality, these env vars are also needed: `GEMINI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `SUPABASE_SECRET_KEY`.

### Lint

- `next lint` was removed in Next.js 16. Run ESLint directly: `npx eslint . --ext .ts,.tsx`
- Pre-existing: 2 ESLint errors (unescaped apostrophes in `AuthModal.tsx`) and ~29 warnings.

### Tests

- Vitest is configured. Run: `npm test` (or `npx vitest run`).
- Test file: `tests/manifestStore.core.test.ts` (10 tests covering core manifest operations and undo/redo).

### Build

- `npm run build` runs `npm run test && next build`. The build fails without real Supabase/Stripe env vars because API routes like `/api/checkout` instantiate Stripe clients at module scope.

### Key directories

- `app/api/` — API routes (`route-prompt`, `checkout`, `customer-portal`, `webhook`, `auth/callback`)
- `app/components/` — React components, subdivided into `modals/`, `panels/`, `tracks/`, `ui/`
- `app/hooks/` — Custom hooks (`timeline/`, `preview/`)
- `app/lib/` — Utilities, rendering engine, transforms, media/audio/text utils
- `app/models/` — Data classes (`VideoClass`, `ImageClass`, `AudioClass`, `TextClass`, `EffectClass`)
- `app/stores/` — Zustand stores (`manifestStore` with slices in `manifest/`, `selectionStore`, `audioStore`)
- `app/utils/supabase/` — Supabase client helpers (client, server, middleware, admin)
