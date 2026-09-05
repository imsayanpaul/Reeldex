# ReelDex 🧠📱

> **The AI-Powered Second Brain & Knowledge Vault for Instagram Reels.**  
> Automatically transcribe, categorize, summarize, and search your saved Instagram Reels via Direct Message or Web Dashboard.

---

## ⚡ Key Features

- **📩 Automatic Instagram DM Ingestion**: Share any Instagram Reel link directly in a Direct Message to `@reeldex.io` — the webhook immediately downloads, transcribes, and indexes it.
- **⚡ Ultra-Fast Audio Transcription**: Powered by **Groq Whisper Large v3**, transcribing audio in ~1-2 seconds.
- **🤖 Structured AI Insights & Categorization**: **Groq LLaMA 3.3 70B** extracts key takeaways, actionable steps, mentioned tools/resources, and categorizes reels automatically (*Tech & AI, Finance, Productivity, Fitness, Career, Food, Design, etc.*).
- **🔎 Ask Dex AI (RAG Knowledge Copilot)**: Ask questions across your entire reel library (*"What AI design tools did I save?"*, *"Summarize all interview tips"*) with instant citations and source video links.
- **📁 Instagram-Native Collections & Management**:
  - Full support for Custom Collections / Folders.
  - Multi-select batch management (batch assign, bulk unsave/delete).
  - Native 2-column mobile grid view.
- **🌐 On-Demand Audio Translation**: 1-click translation of non-English transcripts and summaries into English with 0-token caching.
- **📋 1-Click Exporting**:
  - **WhatsApp & Notes format**: Clean emoji bullets and direct clickable links.
  - **Markdown & `.md` Download**: Perfect for Obsidian, Notion, or personal wikis.
- **⚡ 0-Token Global Caching**: Reuses transcripts and summaries if a reel has already been processed by another user.

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
