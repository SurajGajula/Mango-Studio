# AGENTS.md

## Cursor Cloud specific instructions

### Overview
Mango Studio is a web-based video editor built with **Next.js 16** (App Router), **React 19**, **TypeScript**, and **Zustand**. It is a single-service app — no monorepo, no Docker, no separate backend.

### Dev commands (from `package.json`)
| Task | Command |
|------|---------|
| Dev server | `npm run dev` (Next.js on port 3000) |
| Lint | `npx eslint . --ext .ts,.tsx,.js,.jsx` |
| Tests | `npm run test` (vitest) |
| Build | `npm run build` (runs tests then next build) |

### Linting caveat
`npm run lint` (which runs `next lint`) does **not** work with Next.js 16 — the subcommand was removed. Run ESLint directly via `npx eslint . --ext .ts,.tsx,.js,.jsx`. There are pre-existing warnings (mostly `react-hooks/exhaustive-deps` and `@next/next/no-img-element`) and 2 `react/no-unescaped-entities` errors in `AuthModal.tsx`; these are in the existing codebase and should not block development.

### Environment variables
The app requires a `.env.local` file (gitignored). Required keys:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — Supabase auth + DB
- `SUPABASE_SECRET_KEY` — server-side Supabase admin
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — payments (optional for core editor)
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` — AI chat assistant (optional for core editor)

With placeholder values the app will start, render the landing page + auth modal, and accept form input. Auth/payment/AI features require real credentials.

### FFmpeg WASM
The `public/ffmpeg/` directory (gitignored) must be populated with `@ffmpeg/ffmpeg` WASM binaries for the video export feature to work. The core editor functions without it.

### CORS headers
`next.config.js` sets `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` for SharedArrayBuffer support (needed by FFmpeg WASM). This may affect embedding or cross-origin requests during development.
