# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Mango Studio is a Next.js 16 (App Router, Turbopack) web-based video editor with AI-assisted editing, multi-track timeline, effects, transitions, speed ramping, and audio support. Single service: the Next.js dev server (`npm run dev` on port 3000).

### Running the app

1. Install dependencies: `npm ci` (or `npm install`).
2. Start the dev server: `npm run dev`.
3. Open [http://localhost:3000](http://localhost:3000).

### Signing in

When you are not signed in, the auth modal appears over the editor. Use **Sign in with Google** and complete the flow with a **personal Gmail account** (the same Google account you use for Gmail). Email/password sign-in is also available in the modal if you have an account set up that way.

### Lint

- `npm run lint` runs ESLint (`eslint . --ext .ts,.tsx`); `next lint` was removed in Next.js 16.
- Pre-existing: 2 ESLint errors (unescaped apostrophes in `AuthModal.tsx`) and ~29 warnings.

### Tests

- Vitest is configured. Run: `npm test` (or `npx vitest run`).
- Test file: `tests/manifestStore.core.test.ts` (10 tests covering core manifest operations and undo/redo).

### Build

- `npm run build` runs `npm run test && next build`. A full production build may require the hosted project’s backend configuration to be present for some API routes.

### Key directories

- `app/api/` — API routes (`route-prompt`, `checkout`, `customer-portal`, `webhook`, `auth/callback`)
- `app/components/` — React components, subdivided into `modals/`, `panels/`, `tracks/`, `ui/`
- `app/hooks/` — Custom hooks (`timeline/`, `preview/`)
- `app/lib/` — Utilities, rendering engine, transforms, media/audio/text utils
- `app/models/` — Data classes (`VideoClass`, `ImageClass`, `AudioClass`, `TextClass`, `EffectClass`)
- `app/stores/` — Zustand stores (`manifestStore` with slices in `manifest/`, `selectionStore`, `audioStore`)
- `app/utils/supabase/` — Supabase client helpers (client, server, middleware, admin)
