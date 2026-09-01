# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Frontend: React (Vite), Tailwind CSS, Vanilla CSS design tokens, Lucide React icons, Radix UI primitives.
- Backend: Python (FastAPI), Groq API (Qwen / GPT-OSS RAG inference), Whisper audio transcription, yt-dlp / Instagram Scraping, Supabase PostgreSQL database.

## Users

- Active Instagram users, knowledge workers, creators, marketers, and researchers who save dozens of educational, tutorial, and insight-packed reels but lose track of them.
- Users who need fast retrieval, structured summaries, and actionable lists (tools, books, tips) from video audio without re-watching long clips.

## Product Purpose

ReelDex turns passive Instagram saved reels into an indexed, searchable, AI-powered knowledge vault. It extracts transcripts, synthesizes key takeaways, catalogs mentioned links/tools, and enables conversational semantic Q&A via Dex AI.

## Positioning

Unlike native Instagram bookmark folders that only show static video thumbnails with no text search, ReelDex processes the spoken speech inside videos to make video memory instantly searchable, queryable, and exportable.

## Operating Context

- Real-time Instagram DM webhooks & manual reel sync.
- Mobile-first and desktop-responsive web interface.
- One-click copy for WhatsApp, Notes, and Markdown exports.
- Fast interactive category filtering and custom collection folders.

## Capabilities and Constraints

- Capabilities: Audio transcription, AI summarization, tool & action step extraction, category categorization, conversational RAG AI Copilot ("Ask Dex AI"), custom collection grouping, multi-select batch management.
- Constraints: Respects Instagram rate-limits and video download availability; provides high-contrast legible UI across all screen sizes.

## Brand Commitments

- Name: ReelDex
- Tagline: Your AI Instagram Reel Knowledge Vault
- Aesthetic: Deep OLED dark mode, sleek modern typography, responsive micro-interactions, clean glass elements.

## Evidence on Hand

- Production FastAPI backend in `backend/` with verified Groq RAG pipelines.
- Responsive React frontend in `frontend/` with vault feed, search, and Dex AI Copilot.

## Product Principles

1. **Audio to Insight First**: Spoken knowledge inside reels must be surfaced clearly within seconds of saving.
2. **Effortless Retrieval**: Search and category filtering should feel instant and tactile without friction.
3. **No Fluff / High Signal**: Summaries must preserve exact tool names, recommendations, and action steps without vague filler.
4. **Fast Export**: Key takeaways must be one tap away from being shared to WhatsApp, Notes, or markdown docs.
