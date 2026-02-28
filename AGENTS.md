# AGENTS.md

## Cursor Cloud specific instructions

### Overview

Mango Studio is a Next.js (App Router, v16) single-page app for AI video generation using Google Veo 3.1. There is one service: the Next.js dev server (`npm run dev` on port 3000), which serves both frontend and API routes.

### Running the app

- **Dev server**: `npm run dev` (port 3000)
- Requires `GEMINI_API_KEY` (or `GOOGLE_API_KEY`) in a `.env.local` file for the video generation API route at `/api/generate-video` to work. Without it, the UI loads but video generation returns an error.

### Lint

- `next lint` was removed in Next.js 16. Run ESLint directly: `npx eslint . --ext .ts,.tsx`
- There are 2 pre-existing warnings (react-hooks/exhaustive-deps) in `PreviewArea.tsx` and `Timeline.tsx`.

### Build

- `npm run build` has a pre-existing TypeScript error (`VideoClass.url` is `string | undefined` but assigned to `video.src` which expects `string` in `PreviewArea.tsx:38`). The dev server works fine since it doesn't enforce strict type-checking.

### Key files

- `app/api/generate-video/route.ts` — backend API route for video generation
- `app/lib/genaiClient.ts` — Google GenAI client (reads API key from env)
- `app/stores/manifestStore.ts` — Zustand state store
- `app/components/` — React components (ChatWindow, PreviewArea, Timeline, MainView)
