# Lightweight High-Performance Backend Runtime for Render
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (ffmpeg for yt-dlp audio stream handling)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy Backend application
COPY backend/ ./backend/

# Runtime environment settings
ENV HOST=0.0.0.0
ENV PORT=8000
ENV PYTHONUNBUFFERED=1

EXPOSE 8000

# Start FastAPI server with multi-worker concurrency
CMD ["sh", "-c", "uvicorn backend.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 2"]
