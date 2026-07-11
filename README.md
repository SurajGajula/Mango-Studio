# Mango Studio

**A browser-based video editor for creating short-form, beat-synced content — no desktop app required.**

Mango Studio is a full-stack web application that brings professional video editing to the browser. Users can build multi-track timelines, apply transitions and effects, export in HD (up to 1080p at 60fps), and describe edits in plain English via an AI assistant — all without installing software.

---

## What It Does

Mango Studio targets creators who want fast, polished short-form video (social clips, music edits, talking-head content) without the cost or friction of traditional desktop editors. The product emphasizes:

- **Zero-install editing** — the entire editor runs in the browser on desktop.
- **Free HD export** — finished videos export without watermarks.
- **AI-assisted workflows** — users can split clips, add transitions, replace media, normalize audio, and more through natural-language chat.
- **Beat-sync editing** — audio marking lets creators place markers on a waveform and snap video cuts to the beat for precise rhythm edits.

---

## Key Features

| Area | Capabilities |
|------|-------------|
| **Timeline** | Multi-track editing for video, images, audio, and text; drag, split, trim, ripple edits, undo/redo |
| **Preview** | Real-time canvas rendering with transitions, keyframe animations, crop/placement controls, and speed/pitch adjustment |
| **Effects & transitions** | Fade, slide, zoom, wipe, morph, CRT dither, glitch, grain, vignette, and more |
| **Text overlays** | Custom fonts, styles, and keyboard/speech-driven text animations |
| **Media library** | Cloud-backed folder organization; drag assets directly onto the timeline |
| **Audio tools** | Waveform display, trim controls, volume normalization, pitch shifting, and user-placed beat markers with snap-to-marker editing |
| **AI chat assistant** | On-device LLM routing (WebLLM) for timeline edits; Pro tier adds server-side generation (images, video, speech, transcription) |
| **Background removal** | Client-side segmentation via `@imgly/background-removal` |
| **Projects** | Cloud project persistence with Supabase; pick up editing on any device |
| **Monetization** | Freemium model with Stripe subscriptions (Free + Pro tiers) |

---

## Technical Highlights

This is a substantial TypeScript/React codebase (~240 source files, 26 unit tests) built as a production web app, not a prototype.

### Frontend

- **Next.js 16** (App Router) with **React 19** and **TypeScript**
- **Zustand** for editor state (timeline manifest, selection, history)
- Custom **Canvas 2D + WebGL** rendering engine for real-time preview and export frame composition
- **FFmpeg.wasm** for client-side video encoding — HD export runs entirely in the browser
- **GSAP** for animation easing and timeline-driven motion
- **WebLLM** (`@mlc-ai/web-llm`) for on-device AI chat routing with tool-calling, rule-based fallbacks, and a training dataset pipeline for prompt routing

### Backend & Infrastructure

- **Supabase** — authentication (email + Google OAuth), user profiles, and project metadata
- **Cloudflare R2** (S3-compatible) — media asset storage with presigned upload/download URLs
- **Stripe** — checkout, subscriptions, webhooks, and customer billing portal
- **Vercel Analytics** — usage tracking
- **Next.js API routes** — media CRUD, project snapshots, checkout, and webhooks

### Engineering Practices

- **Vitest** test suite covering timeline math, audio normalization, LLM routing, media persistence, and rendering utilities
- Tests run as part of the production build (`npm run build` → `vitest run` then `next build`)
- Modular architecture: domain models (`VideoClass`, `AudioClass`, etc.), intent parsers for AI actions, and a shared render pipeline used by both preview and export

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (Client)                        │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Timeline │  │ Preview/Export│  │ AI Chat (WebLLM)      │  │
│  │  Editor  │──│ Render Engine │  │ + Intent Router       │  │
│  └──────────┘  └──────────────┘  └───────────────────────┘  │
│         │              │                    │               │
│         └──────────────┴────────────────────┘               │
│                        │                                    │
│                   Zustand Store                             │
└────────────────────────┼────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     Supabase        Cloudflare R2    Stripe
   (auth, projects)  (media assets)  (billing)
```

The editor keeps a **manifest** — a structured representation of all timeline clips, effects, and metadata — that powers preview rendering, export, cloud persistence, and AI context. The same render utilities drive both the live preview canvas and the FFmpeg export pipeline, ensuring WYSIWYG output.

---

## Getting Started (Developers)

### Prerequisites

- Node.js 20+
- Environment variables for Supabase, R2, and Stripe (see `.env` setup in your deployment)

### Commands

```bash
npm install
npm run dev      # Start local dev server
npm test         # Run Vitest unit tests
npm run build    # Test + production build
npm run lint     # ESLint
```

---

## Why This Project Stands Out

For recruiters evaluating engineering depth:

1. **Full product scope** — not a tutorial app; includes auth, billing, cloud storage, AI integration, and a custom video pipeline.
2. **Performance-sensitive UI** — real-time multi-track video preview with frame caching, video element pooling, and scrub-optimized seeking.
3. **AI systems design** — hybrid routing (rule-based + local LLM tool-calling) with structured intent types, validation, and a dataset generation pipeline for improving prompt routing.
4. **Client-side media processing** — FFmpeg.wasm export, background removal, and audio loudness normalization without server round-trips.
5. **Tested critical paths** — timeline adjacency, split logic, media persistence, and LLM route validation are covered by unit tests.

---

## License

Private project. All rights reserved.
