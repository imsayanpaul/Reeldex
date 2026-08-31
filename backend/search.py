import math
import re
from typing import List, Dict, Any, Optional
from backend.config import settings

def tokenize(text: str) -> List[str]:
    """Tokenizes text into normalized lowercase alphanumeric words."""
    if not text:
        return []
    return re.findall(r'\w+', text.lower())

def calculate_bm25_score(query_tokens: List[str], doc_tokens: List[str], avg_doc_len: float, k1: float = 1.5, b: float = 0.75) -> float:
    """Calculates BM25 relevance score between query tokens and document tokens."""
    if not query_tokens or not doc_tokens:
        return 0.0
    
    doc_len = len(doc_tokens)
    score = 0.0
    doc_token_counts = {}
    for t in doc_tokens:
        doc_token_counts[t] = doc_token_counts.get(t, 0) + 1

    for q in query_tokens:
        if q in doc_token_counts:
            freq = doc_token_counts[q]
            # Term frequency saturation
            tf = (freq * (k1 + 1)) / (freq + k1 * (1 - b + b * (doc_len / (avg_doc_len or 1.0))))
            score += tf

    return score

def rank_reels_search(reels_data: List[Dict[str, Any]], query: str, category_filter: Optional[str] = None, tag_filter: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Ranks a list of reels using hybrid scoring across:
    - AI Summary (weight 3.0)
    - Full Transcript (weight 2.0)
    - Action Items & Tools (weight 3.5)
    - Tags (weight 2.5)
    - Title & Author (weight 2.0)
    """
    filtered = reels_data
    if category_filter and category_filter.lower() != "all":
        filtered = [r for r in filtered if (r.get("category") or "").lower() == category_filter.lower()]
    
    if tag_filter:
        tag_clean = tag_filter.lower().strip()
        filtered = [r for r in filtered if any(tag_clean in (t or "").lower() for t in r.get("tags", []))]

    if not query or not query.strip():
        # Return sorted by newest
        return sorted(filtered, key=lambda x: x.get("created_at", ""), reverse=True)

    query_tokens = tokenize(query)
    if not query_tokens:
        return filtered

    # Calculate average doc length for BM25
    doc_lengths = []
    for r in filtered:
        text = f"{r.get('title', '')} {r.get('summary', '')} {r.get('full_text', '')} {' '.join(r.get('tags', []))}"
        doc_lengths.append(len(tokenize(text)))
    avg_len = sum(doc_lengths) / max(len(doc_lengths), 1)

    scored_results = []
    for r in filtered:
        title_tokens = tokenize(r.get("title", ""))
        summary_tokens = tokenize(r.get("summary", ""))
        transcript_tokens = tokenize(r.get("full_text", ""))
        tags_tokens = tokenize(" ".join(r.get("tags", [])))
        author_tokens = tokenize(r.get("author", "") or r.get("sender_username", ""))
        
        # Action items tokens
        actions_text = " ".join([a.get("text", "") for a in r.get("action_items", []) if isinstance(a, dict)])
        action_tokens = tokenize(actions_text)

        score = (
            calculate_bm25_score(query_tokens, summary_tokens, avg_len) * 3.5 +
            calculate_bm25_score(query_tokens, action_tokens, avg_len) * 4.0 +
            calculate_bm25_score(query_tokens, tags_tokens, avg_len) * 3.0 +
            calculate_bm25_score(query_tokens, title_tokens, avg_len) * 2.5 +
            calculate_bm25_score(query_tokens, author_tokens, avg_len) * 2.0 +
            calculate_bm25_score(query_tokens, transcript_tokens, avg_len) * 1.5
        )

        # Exact phrase match bonus
        q_lower = query.lower()
        if q_lower in (r.get("summary", "") or "").lower():
            score += 8.0
        if q_lower in (r.get("full_text", "") or "").lower():
            score += 5.0
        if q_lower in actions_text.lower():
            score += 10.0

        if score > 0 or len(query_tokens) == 0:
            r_copy = dict(r)
            r_copy["relevance_score"] = round(score, 2)
            scored_results.append((score, r_copy))

    # Sort by score descending
    scored_results.sort(key=lambda x: x[0], reverse=True)
    return [item[1] for item in scored_results]


import time
import hashlib

# In-memory LRU/TTL Response Cache for Ask AI queries (0 token re-queries)
AI_QUERY_CACHE: Dict[str, Dict[str, Any]] = {}
CACHE_TTL_SECONDS = 3600  # 1 hour

def sanitize_ai_response(text: str) -> str:
    """Post-processes AI response to remove broken trailing links, fix parentheses, and ensure valid markdown."""
    if not text:
        return text

    cleaned = text
    # 1. Remove incomplete trailing broken link at very end of output
    cleaned = re.sub(r'(\n|\s)*[-*]?\s*(Source:?\s*)?\[[^\]]*\]?\s*\(?\s*https?://[^\)\s]*$', '', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r'(\n|\s)*[-*]?\s*(Source:?\s*)?\[[^\]]*$', '', cleaned, flags=re.IGNORECASE)

    # 2. Fix double closed parentheses
    cleaned = cleaned.replace('))', ')')

    return cleaned.strip()

async def ask_reels_ai(user_question: str, reels_context: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    RAG (Retrieval-Augmented Generation) Chat Engine:
    Answers a user's question by synthesizing information across their saved reels library.
    Includes Top-K BM25 token compression and 0-token semantic response caching.
    """
    if not reels_context:
        return {
            "answer": "You don't have any reels saved in your library yet! Send or share a reel via Instagram to start building your knowledge base.",
            "citations": []
        }

    clean_question = user_question.strip().lower()

    # 1. Check Query Response Cache (0 Token Consumption)
    reel_ids_key = ",".join(str(r.get("id")) for r in sorted(reels_context, key=lambda x: x.get("id") or 0))
    cache_key = hashlib.md5(f"{clean_question}::{reel_ids_key}".encode()).hexdigest()

    now = time.time()
    if cache_key in AI_QUERY_CACHE:
        cached_entry = AI_QUERY_CACHE[cache_key]
        cached_ans = cached_entry.get("response", {}).get("answer", "")
        # Validate cache: ensure cached answer is valid and does NOT end with a broken truncated link
        if now - cached_entry.get("timestamp", 0) < CACHE_TTL_SECONDS and not re.search(r'\[[^\]]*\]?\s*\(?\s*https?://[^\)\s]*$', cached_ans):
            print(f"[Ask AI Cache HIT] Returning cached response for '{user_question[:30]}...' (0 tokens used)")
            return cached_entry["response"]
        else:
            AI_QUERY_CACHE.pop(cache_key, None)

    # 2. Dynamic Top-K Selection with Score Thresholding & Broad-Query Awareness
    is_broad_query = any(w in clean_question for w in [
        "all", "everything", "every", "list", "summarize", "overview", 
        "what reels", "what are all", "my reels", "library", "all my", "tools", "compare"
    ])

    scored_reels = rank_reels_search(reels_context, user_question)
    
    if is_broad_query:
        # Broad questions: Include up to 15-20 reels for comprehensive synthesis
        top_reels = scored_reels[:16] if scored_reels else reels_context[:16]
    else:
        # Specific questions: Include all relevant reels (up to 12 reels)
        positive_matches = [r for r in scored_reels if r.get("relevance_score", 0) > 0]
        if positive_matches:
            top_reels = positive_matches[:12]
        else:
            top_reels = scored_reels[:6] if scored_reels else reels_context[:6]

    # 3. Build dynamic compressed context prompt with character budget guard (35k chars ~ 8k tokens)
    context_blocks = []
    citations = []
    char_budget = 35000
    current_chars = 0

    for idx, r in enumerate(top_reels, 1):
        citations.append({
            "id": r.get("id"),
            "reel_id": r.get("id"),
            "title": r.get("title") or f"Reel #{r.get('id')}",
            "author": r.get("author") or r.get("sender_username"),
            "reel_url": r.get("reel_url"),
            "category": r.get("category"),
            "summary": r.get("summary")
        })
        
        # Clean action items
        action_strs = []
        for a in r.get("action_items", []):
            if isinstance(a, str) and not a.startswith("{"):
                action_strs.append(a)
            elif isinstance(a, dict):
                val = a.get("text") or a.get("name") or a.get("value")
                if val:
                    action_strs.append(val)
        actions = ", ".join(action_strs)

        # Context compression: Include summary + top 350 chars of transcript
        summary_text = r.get("summary") or ""
        transcript_snippet = (r.get("full_text") or "")[:350]
        reel_url = r.get("reel_url") or (f"https://www.instagram.com/reel/{r.get('shortcode')}/" if r.get("shortcode") else "")

        block = (
            f"[Reel {idx}]: \"{r.get('title')}\" by @{r.get('author') or 'creator'}\n"
            f"Video Link: {reel_url}\n"
            f"Category: {r.get('category', 'General')}\n"
            f"Summary: {summary_text}\n"
            f"Tools/Actions: {actions}\n"
            f"Key Excerpt: {transcript_snippet}\n"
        )
        
        if current_chars + len(block) > char_budget:
            break

        context_blocks.append(block)
        current_chars += len(block)

    context_str = "\n---\n".join(context_blocks)

    system_prompt = (
        "You are Dex AI, an intelligent personal knowledge assistant for a user's saved Instagram Reels. "
        "Answer the user's question accurately using ONLY the provided reels context. "
        "STRICT FORMATTING RULE 1 (NO TABLES): NEVER use Markdown tables (`| ... |`). "
        "STRICT FORMATTING RULE 2 (CATEGORIZED PUNCHY BULLETS): Group your response into logical category headings (e.g. `### 🎨 Web Design Tools & Libraries`, `### 📦 GitHub Repositories`). "
        "Format each item as a short, punchy 1-sentence bullet point:\n"
        "- **Tool / Project Name** — Brief 1-sentence explanation of what it does.\n"
        "  [Watch Video](url) • @creator\n\n"
        "COMPACTNESS RULE: Keep bullet descriptions concise (1 sentence max) so all items fit cleanly without running out of tokens. "
        "CRITICAL LINK RULE: EVERY markdown link MUST be strictly completed with a closing parenthesis `)`. Example: `[Watch Video](https://www.instagram.com/reel/CODE/)`. Never truncate URLs or leave link parentheses open."
    )

    user_prompt = f"""User Question: {user_question}

Relevant Saved Reels Context:
\"\"\"
{context_str}
\"\"\"

Provide a direct, comprehensive answer listing ALL relevant items with specific citations."""

    api_key = settings.GROQ_API_KEY
    if not api_key:
        return {
            "answer": "Please configure your GROQ_API_KEY to enable AI library chat.",
            "citations": citations
        }

    models_to_try = [
        "openai/gpt-oss-120b",
        "qwen/qwen3.6-27b",
        "groq/compound",
        "groq/compound-mini"
    ]

    answer = None
    last_error = None

    if api_key:
        try:
            from groq import Groq
            client = Groq(api_key=api_key)
            for model_id in models_to_try:
                try:
                    response = client.chat.completions.create(
                        model=model_id,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": user_prompt}
                        ],
                        temperature=0.3,
                        max_tokens=2500
                    )
                    answer = response.choices[0].message.content
                    if answer:
                        break
                except Exception as model_err:
                    last_error = model_err
                    print(f"[RAG Groq {model_id} error]: {model_err}")
                    continue
        except Exception as groq_err:
            last_error = groq_err

    # Fallback to OpenAI if Groq fails or is not available
    if not answer and settings.OPENAI_API_KEY:
        try:
            from openai import OpenAI
            client = OpenAI(api_key=settings.OPENAI_API_KEY)
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=2500
            )
            answer = response.choices[0].message.content
        except Exception as oai_err:
            last_error = oai_err

    if not answer:
        return {
            "answer": f"I encountered an error connecting to the AI engine: {str(last_error)}",
            "citations": citations
        }

    # Post-process answer to remove broken trailing links and ensure valid markdown
    answer = sanitize_ai_response(answer)

    res_payload = {
        "answer": answer,
        "citations": citations
    }
    # Save in Cache
    AI_QUERY_CACHE[cache_key] = {"timestamp": now, "response": res_payload}
    if len(AI_QUERY_CACHE) > 500:
        AI_QUERY_CACHE.pop(next(iter(AI_QUERY_CACHE)))
    return res_payload
