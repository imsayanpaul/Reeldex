# ReelDex 🧠📱

> **The AI-Powered Second Brain & Knowledge Vault for Instagram Reels.**  
> Automatically transcribe, categorize, summarize, and search your saved Instagram Reels via Direct Message or Web Dashboard.

---

## ⚡ Key Features

### 📩 Instagram Integration & Ingestion
- **Automatic Instagram DM Ingestion**: Share any Instagram Reel link directly in a Direct Message to `@reeldex.io` — the webhook immediately downloads, transcribes, and saves it to your vault.
- **Instant DM Auto-Reply**: The bot replies in DM with an executive summary, extracted tools/links, and a magic link to view the reel on your dashboard.
- **Passwordless Account Linking**: Generate a temporary 6-digit code on the web (`MIND-XXXXXX`) and send it in DM to `@reeldex.io` to instantly pair your web session with your Instagram account.
- **Web Link Ingestion**: Direct link submission box inside the web interface for saving reels on desktop.

### 🎙️ AI Transcription & Intelligence Engine
- **Ultra-Fast Pure-Audio Extraction**: Uses `yt-dlp` to extract the pure audio stream in under 1 second without downloading heavy video files.
- **Word-for-Word Transcription**: Powered by **Groq Whisper Large v3**, transcribing full speech with timestamps in ~1-2 seconds.
- **Structured AI Insights**: Powered by **Groq LLaMA 3.3 70B** to generate concise titles, executive summaries, and core bullet takeaways.
- **Automated Taxonomy Categorization**: Automatically categorizes reels into 10+ topics (*Tech & AI, Career & Business, Finance & Investing, Productivity & Mindset, Fitness & Health, Recipes & Food, Learning & Books, Design & Creativity, Entertainment & Humor, General Knowledge*).
- **Concrete Action Items & Tool Extraction**: Automatically detects and surfaces software tools, website URLs, promo codes, books, and step-by-step instructions mentioned in the video.
- **On-Demand Audio Translation**: 1-click translation of foreign language transcripts and summaries into English, permanently cached in the database.

### ⚡ Performance & Token Optimization
- **0-Token Global Deduplication**: If another user has previously saved the same reel, transcripts and insights are linked instantly with **0 LLM/Whisper tokens consumed**.
- **In-Flight Concurrency Locks**: Mutex locks prevent multiple background workers from downloading or transcribing the same viral reel simultaneously.
- **Zero-Speech Bypass**: Silent or purely musical reels automatically skip LLM summarization to save compute.

### 🔎 Ask Dex AI (RAG Knowledge Copilot)
- **Library-Wide Semantic Search**: Chat naturally across your entire saved reel library (*"What AI design tools did I save?"*, *"Summarize all job interview tips"*).
- **Grounded Answers with Video Citations**: Every response cites the exact Instagram Reel with clickable video links, timestamps, and creator handles.
- **Interactive "Show More Results"**: Continue unearthing additional items from your library starting right where the previous answer left off.
- **Suggested Query Chips**: Instant starter prompts to explore insights quickly.

### 📱 Instagram-Native UI & Organization
- **Faithful Instagram Dark Aesthetic**: Sleek `#0c0f14` theme with glassmorphic top navigation and subtle border accents.
- **Strict 2-Column Mobile Grid**: Specially tuned for smartphones (320px–430px) with 16:10 aspect-ratio thumbnails and 2-line clamped summaries side-by-side.
- **Custom Collections / Folders**: Group reels into custom folders with 4-quadrant photo collage album covers and private access controls.
- **Multi-Select Batch Manage Mode**: Native corner checkboxes with Select All / Deselect All to batch-assign reels to collections or bulk-unsave.
- **Full-Screen Reel Detail Modal**: View high-res poster, watch video directly on Instagram, inspect word-for-word transcript, and retry failed transcriptions.
- **Live Search & Category Pills**: Filter by category pills with live reel counters, or perform instant full-text search across titles, creators, tags, and transcripts.

### 📋 Multi-Format Knowledge Export
- **WhatsApp & Notes Format**: 1-click copy formatted with bold headlines (`*Title*`), unicode bullets (`•`), and direct links (`🔗 https://...`).
- **Raw Markdown Copy**: Clean GitHub-flavored markdown ready to paste into Obsidian, Notion, or Roam.
- **Direct `.md` File Download**: Saves a clean `.md` document directly to your device with 1 click.

---

## 🏗️ Architecture & Tech Stack

### Frontend
- **Framework**: React 19 + Vite
- **Styling**: Vanilla CSS (Tailwind utilities, Lucide React icons, Radix UI primitives)
- **UI Components**: Sonner (Toasts), Vaul (Bottom Sheets), React Markdown
- **Responsive Design**: Instagram-native mobile viewports and desktop layouts

### Backend & AI Pipeline
- **API Framework**: FastAPI (Python 3.11+) + Uvicorn + GZip Middleware
- **Database**: SQLAlchemy ORM with SQLite (local development) and PostgreSQL (Supabase / Render production)
- **Downloader**: `yt-dlp` (streamlined pure-audio extraction)
- **AI Engine**: 
  - Groq Cloud API (`whisper-large-v3` for speech-to-text)
  - Groq Cloud API (`llama-3.3-70b-versatile` for summarization & RAG)
- **Messaging**: Meta Instagram Graph API / Webhook Integration

---

## 🚀 Getting Started Locally

### Prerequisites
- Node.js 18+ & npm
- Python 3.10+
- FFmpeg (required for `yt-dlp` audio processing)

### 1. Clone the Repository
```bash
git clone https://github.com/imsayanpaul/Reeldex.git
cd Reeldex
```

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
GROQ_API_KEY=your_groq_api_key_here
META_VERIFY_TOKEN=your_meta_webhook_verify_token
INSTAGRAM_PAGE_ACCESS_TOKEN=your_instagram_graph_token
HOST=127.0.0.1
PORT=8000
```

### 3. Backend Setup
```bash
# Create and activate virtual environment
python -m venv venv
.\venv\Scripts\activate   # On Windows
# source venv/bin/activate # On macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Run FastAPI backend server
uvicorn backend.main:app --host 127.0.0.1 --port 8000 --reload
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

---

## 📦 Deployment

- **Backend**: Containerized via `Dockerfile` and deployed on [Render](https://render.com) using `render.yaml`.
- **Database**: PostgreSQL hosted on [Supabase](https://supabase.com).
- **Frontend**: Single Page Application built with Vite and deployed on [Vercel](https://vercel.com).

---

## 📄 License

This project is licensed under the MIT License.
