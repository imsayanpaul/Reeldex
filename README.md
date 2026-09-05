<div align="center">

# 🧠 ReelDex

### **The AI-Powered Second Brain & Knowledge Vault for Instagram Reels**

Turn your saved Instagram Reels into a structured, searchable, and actionable personal knowledge base.

[![FastAPI](https://img.shields.io/badge/FastAPI-009688?style=for-the-badge&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React_19-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite_8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Groq](https://img.shields.io/badge/Groq_Cloud-F55036?style=for-the-badge&logo=groq&logoColor=white)](https://groq.com/)
[![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=for-the-badge)](LICENSE)

<br />

[Live Web App](https://reeldex-io.vercel.app) • [Backend API Service](https://reeldex-api.onrender.com) • [Instagram DM Bot](https://ig.me/m/reeldex.io)

</div>

---

## 📌 Table of Contents

- [The Problem & The Vision](#-the-problem--the-vision)
- [System Architecture](#-system-architecture)
- [Core Features](#-core-features)
  - [1. Instagram Direct Message Automation](#1-instagram-direct-message-automation)
  - [2. Dual-AI Ingestion & Summarization Pipeline](#2-dual-ai-ingestion--summarization-pipeline)
  - [3. Zero-Token Global Caching & Concurrency Locks](#3-zero-token-global-caching--concurrency-locks)
  - [4. Ask Dex AI: RAG Knowledge Copilot](#4-ask-dex-ai-rag-knowledge-copilot)
  - [5. Instagram-Native Mobile UI & Collections](#5-instagram-native-mobile-ui--collections)
  - [6. Multi-Format Export Suite](#6-multi-format-export-suite)
  - [7. Multilingual Audio Translation](#7-multilingual-audio-translation)
- [Database Models & Schema](#-database-models--schema)
- [API Reference](#-api-reference)
- [Tech Stack Overview](#-tech-stack-overview)
- [Environment Variables](#-environment-variables)
- [Local Development Setup](#-local-development-setup)
  - [Backend Setup (FastAPI)](#backend-setup-fastapi)
  - [Frontend Setup (React + Vite)](#frontend-setup-react--vite)
- [Production Deployment](#-production-deployment)
- [License](#-license)

---

## 💡 The Problem & The Vision

Millions of people save educational, high-signal Instagram Reels daily — coding tutorials, productivity frameworks, workout regimens, business case studies, recipes, and design resources. However:
- Saved posts quickly turn into an **unsearchable digital graveyard**.
- Instagram offers **no full-text transcript search** inside video audio.
- Finding that one reel you saved 3 months ago with a specific website or prompt is nearly impossible.

**ReelDex solves this completely.** By forwarding an Instagram reel in a DM to `@reeldex.io`, the engine downloads the audio, transcribes every spoken word with **Whisper Large v3**, extracts structured insights and tools with **LLaMA 3.3 70B**, and stores it in your private Second Brain vault.

---

## 🏛️ System Architecture

```mermaid
flowchart TD
    User([👤 User]) -->|1. Shares Reel Link| IG_DM[💬 Instagram DM / Web UI]
    IG_DM -->|2. Webhook Event| MetaAPI[🌐 Meta Graph Webhook]
    MetaAPI -->|3. POST /api/webhook/instagram| FastAPI[🚀 FastAPI Backend Engine]
    
    FastAPI -->|4. Global Cache Check| DB[(🗄️ PostgreSQL / SQLite)]
    
    subgraph Ingestion Pipeline
        FastAPI -->|5a. Extract Audio Stream| YTDLP[⚡ yt-dlp Engine]
        YTDLP -->|5b. Transcribe Audio in 1-2s| GroqWhisper[🎙️ Groq Whisper Large v3]
        GroqWhisper -->|5c. Categorize, Tag & Summarize| GroqLLaMA[🧠 Groq LLaMA 3.3 70B]
    end
    
    GroqLLaMA -->|6. Save Transcripts & Insights| DB
    FastAPI -->|7. Instant DM Auto-Reply| IG_DM
    
    subgraph Client Application
        Frontend[📱 React 19 + Vite Dashboard] <-->|8. REST API / Auth Token| FastAPI
        Frontend <-->|9. Ask Dex AI RAG Copilot| RAGSearch[🔍 Hybrid Semantic Search + Grounding]
        RAGSearch <--> DB
    end
```

---

## ✨ Core Features

### 1. Instagram Direct Message Automation
- **Frictionless Ingestion**: Simply tap "Share" on any Reel inside the official Instagram app and send it to **`@reeldex.io`**.
- **Instant Magic Link**: The bot auto-replies with an overview summary, detected tools, category tags, and a magic link that directly opens the reel in your personal dashboard.
- **Account Linking via 6-Digit Code**: Generate a temporary 6-digit code on the web app (e.g. `MIND-849201`), DM it to `@reeldex.io`, and your web browser is instantly bound to your Instagram account.

### 2. Dual-AI Ingestion & Summarization Pipeline
1. **Audio Extraction**: `yt-dlp` extracts the pure audio stream in under 1 second without downloading unnecessary high-definition video chunks.
2. **Groq Whisper Large v3**: Spoken audio is transcribed word-for-word with precise timestamp segments in ~1-2 seconds.
3. **Groq LLaMA 3.3 70B Reasoning**:
   - Generates a clear, punchy **Title**.
   - Extracts a concise **Executive Summary**.
   - Pulls out **Action Items** (tools, websites, coupon codes, step-by-step instructions).
   - Assigns automatic **Categories** (*Tech & AI, Career & Business, Finance & Investing, Productivity & Mindset, Fitness & Health, Recipes & Food, Learning & Books, Design & Creativity, Entertainment & Humor, General Knowledge*).
   - Generates relevant **Topic Tags**.

### 3. Zero-Token Global Caching & Concurrency Locks
- **Global Deduplication**: If User A has already processed reel `ABC123xyz`, and User B submits the same reel URL, the system detects the existing shortcode in the global catalog and links the transcript in **0 milliseconds with 0 LLM/Whisper tokens consumed**.
- **In-Flight Mutex**: If multiple workers receive the same viral reel simultaneously, an in-flight lock holds redundant jobs until the first worker completes, preventing duplicate Groq API charges.
- **Zero-Speech Bypass**: Purely musical or silent reels skip LLM summarization to eliminate unnecessary compute.

### 4. Ask Dex AI: RAG Knowledge Copilot
- **Semantic Retrieval**: Queries across all your saved transcripts, summaries, and action items.
- **Contextual Grounding**: Synthesizes answers based strictly on the content of reels you have saved (*e.g., "List all interview preparation tips from my saved reels"*, *"Which AI tools were recommended for web design?"*).
- **Direct Video Citations**: Every recommendation includes a clickable source link directly to the Instagram Reel and creator handle.
- **"Show More Results"**: Interactive pagination to unearth additional insights from your library without re-prompting.

### 5. Instagram-Native Mobile UI & Collections
- **Faithful Aesthetic**: Styled after Instagram's native Saved collection interface with sleek dark mode (`#0c0f14`), tactile interactions, and glassmorphic navigation.
- **Strict 2-Column Mobile Grid**: Tailored specifically for modern phone viewports (320px–430px) so thumbnails and 2-line summaries remain readable and visually balanced side-by-side.
- **Custom Collections / Folders**: Create custom folders (e.g., *Startup Ideas*, *Workout Routines*, *Recipes*), view 4-cover album collages, and organize your library.
- **Batch Manage Mode**: Multi-select reels with native corner checkboxes to batch-assign to collections or bulk-unsave.

### 6. Multi-Format Export Suite
From the detail view or chat copilot, export your synthesized knowledge with 1 click:
- **WhatsApp & Notes Format**: Formatted with bold titles (`*Title*`), unicode bullet points (`•`), and clean direct links (`🔗 https://...`).
- **Raw Markdown Copy**: Clean GitHub-flavored markdown ready to paste into Obsidian, Notion, or Roam.
- **Download `.md`**: Saves a clean, local `.md` file directly to your device.

### 7. Multilingual Audio Translation
- Automatically detects non-English reels (Spanish, Hindi, French, German, Japanese, etc.).
- On-demand **1-Click Translation** converts both the full transcript and the AI summary into English, cached permanently in the database.

---

## 🗄️ Database Models & Schema

```
┌──────────────────────────────────────────────────────────┐
│                          users                           │
├──────────────────────┬──────────────┬────────────────────┤
│ id (PK)              │ INTEGER      │ Auto-increment     │
│ email                │ VARCHAR(255) │ Nullable           │
│ display_name         │ VARCHAR(100) │ "User #3832"       │
│ instagram_sender_id  │ VARCHAR(100) │ Unique, Indexed    │
│ instagram_username   │ VARCHAR(100) │ Nullable           │
│ auth_token           │ VARCHAR(255) │ Unique, Indexed    │
│ created_at           │ DATETIME     │ UTC Timestamp      │
└──────────────────────┴──────────────┴────────────────────┘
          │ 1
          │
          │ N
┌─────────▼────────────────────────────────────────────────┐
│                       collections                        │
├──────────────────────┬──────────────┬────────────────────┤
│ id (PK)              │ INTEGER      │ Auto-increment     │
│ user_id (FK)         │ INTEGER      │ References users   │
│ name                 │ VARCHAR(100) │ "AI Tools"         │
│ emoji                │ VARCHAR(20)  │ "📁"               │
│ created_at           │ DATETIME     │ UTC Timestamp      │
└──────────────────────┴──────────────┴────────────────────┘
          │ 1
          │
          │ N
┌─────────▼────────────────────────────────────────────────┐
│                          reels                           │
├──────────────────────┬──────────────┬────────────────────┤
│ id (PK)              │ INTEGER      │ Auto-increment     │
│ user_id (FK)         │ INTEGER      │ References users   │
│ collection_id (FK)   │ INTEGER      │ References collect.│
│ reel_url             │ VARCHAR(500) │ Instagram URL      │
│ shortcode            │ VARCHAR(100) │ e.g. "C_7xyz123"   │
│ title                │ VARCHAR(300) │ AI Generated Title │
│ author               │ VARCHAR(100) │ Creator username   │
│ thumbnail_url        │ VARCHAR(1000)│ Cover image URL    │
│ duration             │ FLOAT        │ Seconds            │
│ category             │ VARCHAR(100) │ e.g. "Tech & AI"   │
│ tags                 │ JSON         │ ["#ai", "#tools"]  │
│ action_items         │ JSON         │ [{type, name}]     │
│ status               │ VARCHAR(50)  │ completed / failed │
│ created_at           │ DATETIME     │ UTC Timestamp      │
└──────────────────────┴──────────────┴────────────────────┘
          │ 1
          │
          │ 1
┌─────────▼────────────────────────────────────────────────┐
│                       transcripts                        │
├──────────────────────┬──────────────┬────────────────────┤
│ id (PK)              │ INTEGER      │ Auto-increment     │
│ reel_id (FK)         │ INTEGER      │ Unique, Ref reels  │
│ full_text            │ TEXT         │ Raw speech-to-text │
│ language             │ VARCHAR(20)  │ "en", "es", etc.   │
│ summary              │ TEXT         │ Structured summary │
│ key_points           │ JSON         │ Core takeaways     │
│ segments             │ JSON         │ Timestamps & words │
│ translated_text      │ TEXT         │ English transcript │
│ translated_summary   │ TEXT         │ English summary    │
└──────────────────────┴──────────────┴────────────────────┘
```

---

## 📡 API Reference

### Reels
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/reels?token={token}&category={cat}&search={q}&collection_id={id}` | Fetch user's reels with category, collection, or search filtering |
| `GET` | `/api/reels/{id}` | Retrieve single reel with full transcript segments and insights |
| `POST` | `/api/reels` | Submit a reel URL for background processing |
| `DELETE` | `/api/reels/{id}?token={token}` | Delete a reel from the user's vault |
| `POST` | `/api/reels/{id}/retry?token={token}` | Re-trigger audio download and transcription on failed reel |
| `POST` | `/api/reels/{id}/translate` | Translate transcript and summary to English on-demand |
| `POST` | `/api/reels/{id}/collection?token={token}` | Assign or remove a reel from a collection |
| `POST` | `/api/reels/batch/assign?token={token}` | Bulk assign multiple reels to a collection |
| `POST` | `/api/reels/batch/delete?token={token}` | Bulk delete/unsave multiple reels |

### Collections
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/collections?token={token}` | Retrieve all collections for authenticated user |
| `POST` | `/api/collections?token={token}` | Create a new collection (`{ name: "..." }`) |
| `PUT` | `/api/collections/{id}?token={token}` | Rename an existing collection |
| `DELETE` | `/api/collections/{id}?token={token}` | Delete a collection (reels remain in vault) |

### AI Copilot & Search
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/chat` | Ask Dex AI RAG endpoint across user's saved reels |
| `GET` | `/api/categories` | Returns system-supported categorization taxonomy |

### Authentication & Meta Webhooks
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/session` | Initialize or validate guest / linked user session |
| `POST` | `/api/auth/generate-code` | Generate a 6-digit Instagram pairing code |
| `GET` | `/api/webhook/instagram` | Meta Webhook hub verification challenge |
| `POST` | `/api/webhook/instagram` | Meta Webhook event ingestion for Direct Messages |

---

## 💻 Tech Stack Overview

| Area | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | React 19 | Declarative UI and fast component tree rendering |
| **Build Tooling** | Vite 8 + `@vitejs/plugin-react` | Lightning-fast HMR and optimized production bundles |
| **Icons & Design** | Lucide React + Tailwind CSS | Sleek icon set and utility styling |
| **UI Components** | Sonner + Vaul + Radix UI | Toasts, native-feeling mobile bottom sheets, tooltips |
| **Backend Framework** | FastAPI (Python 3.11) | High-performance asynchronous REST API |
| **Server** | Uvicorn + GZipMiddleware | ASGI production web server with gzip response compression |
| **ORM & Database** | SQLAlchemy + SQLite / PostgreSQL | Database abstraction with automated schema migration |
| **Media Extraction** | `yt-dlp` | Headless, rapid audio extraction from Instagram CDN |
| **Speech AI** | Groq (`whisper-large-v3`) | Sub-second audio transcription |
| **Reasoning AI** | Groq (`llama-3.3-70b-versatile`)| Structured summarization, tool extraction, and RAG |
| **Integration** | Meta Graph API | Instagram Direct Message webhook ingestion |

---

## 🔐 Environment Variables

Create a `.env` file in the root directory:

```env
# ========================================================
# AI & Speech Providers
# ========================================================
GROQ_API_KEY=gsk_your_groq_api_key_here
OPENAI_API_KEY=optional_fallback_key_here

# ========================================================
# Meta / Instagram Graph API Configuration
# ========================================================
META_VERIFY_TOKEN=your_custom_webhook_secret_verify_token
INSTAGRAM_PAGE_ACCESS_TOKEN=your_meta_page_access_token_here
META_APP_SECRET=optional_app_secret

# ========================================================
# Database Configuration
# ========================================================
# Leave blank for local SQLite (reeldex.db), or provide PostgreSQL connection URI:
DATABASE_URL=postgresql://user:password@db.example.supabase.co:5432/postgres

# ========================================================
# Server Configuration
# ========================================================
HOST=127.0.0.1
PORT=8000
DEBUG=True
```

---

## 🛠️ Local Development Setup

### Prerequisites
1. **Node.js** (v18 or higher)
2. **Python** (v3.10 or higher)
3. **FFmpeg** installed and accessible in your system `PATH` (used by `yt-dlp` to process audio streams)

---

### Backend Setup (FastAPI)

1. Open a terminal in the project root:
   ```bash
   # Create virtual environment
   python -m venv venv

   # Activate virtual environment
   # On Windows (PowerShell / CMD):
   .\venv\Scripts\activate
   # On macOS / Linux:
   source venv/bin/activate
   ```

2. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

3. Launch the backend API server:
   ```bash
   python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
   ```
   The backend API will be available at: **`http://localhost:8000`**  
   Interactive Swagger docs are at: **`http://localhost:8000/docs`**

---

### Frontend Setup (React + Vite)

1. Open a second terminal window:
   ```bash
   cd frontend
   npm install
   ```

2. Start the Vite development server:
   ```bash
   npm run dev
   ```
   The frontend dashboard will be available at: **`http://localhost:5173`**

3. **Open with your Profile**:  
   If you have an existing auth token, you can open:
   ```text
   http://localhost:5173/?token=YOUR_AUTH_TOKEN
   ```

---

## 🚢 Production Deployment

### 1. Backend (Render / Docker)
The repository includes a ready-to-deploy `Dockerfile` and `render.yaml` specification:
- Base image: `python:3.11-slim` with `ffmpeg` installed.
- Start command: `uvicorn backend.main:app --host 0.0.0.0 --port 8000`.

### 2. Database (Supabase PostgreSQL)
- Set the `DATABASE_URL` environment variable on Render pointing to your Supabase PostgreSQL database transaction pooler.
- SQLAlchemy automatically verifies and applies column migrations on startup.

### 3. Frontend (Vercel)
- Connect the GitHub repository to [Vercel](https://vercel.com).
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variable: `VITE_API_URL=https://your-backend-service.onrender.com`

---

## 📄 License

Distributed under the **MIT License**. See `LICENSE` for more information.

<div align="center">
  <sub>Built with ❤️ by Sayan Paul</sub>
</div>
