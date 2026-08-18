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


async def ask_reels_ai(user_question: str, reels_context: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    RAG (Retrieval-Augmented Generation) Chat Engine:
    Answers a user's question by synthesizing information across their saved reels library.
    """
    if not reels_context:
        return {
            "answer": "You don't have any reels saved in your library yet! Send or share a reel via Instagram to start building your knowledge base.",
            "citations": []
        }

    # Find the most relevant reels for the question
    top_reels = rank_reels_search(reels_context, user_question)[:5]
    if not top_reels:
        top_reels = reels_context[:4]

    # Build context prompt
    context_blocks = []
    citations = []
    for idx, r in enumerate(top_reels, 1):
        citations.append({
            "reel_id": r.get("id"),
            "title": r.get("title") or f"Reel #{r.get('id')}",
            "author": r.get("author") or r.get("sender_username"),
            "reel_url": r.get("reel_url"),
            "category": r.get("category"),
            "summary": r.get("summary")
        })
        actions = ", ".join([a.get("text", "") for a in r.get("action_items", []) if isinstance(a, dict)])
        context_blocks.append(
            f"[Reel {idx}]: \"{r.get('title')}\" by @{r.get('author') or 'creator'}\n"
            f"Category: {r.get('category')}\n"
            f"Summary: {r.get('summary')}\n"
            f"Tools/Actions: {actions}\n"
            f"Transcript: {r.get('full_text', '')[:600]}\n"
        )

    context_str = "\n---\n".join(context_blocks)

    system_prompt = (
        "You are ReelMind AI, an intelligent personal knowledge assistant for a user's saved Instagram Reels. "
        "Answer the user's question accurately using ONLY the provided reels context. "
        "Cite the specific creator (@handle) or Reel Title when mentioning facts, tools, promo codes, or steps. "
        "Be concise, helpful, and formatted in clean markdown bullet points."
    )

    user_prompt = f"""User Question: {user_question}

Relevant Saved Reels Context:
\"\"\"
{context_str}
\"\"\"

Provide a direct, clear answer with specific citations."""

    api_key = settings.GROQ_API_KEY
    if not api_key:
        return {
            "answer": "Please configure your GROQ_API_KEY to enable AI library chat.",
            "citations": citations
        }

    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,
            max_tokens=600
        )
        answer = response.choices[0].message.content
        return {
            "answer": answer,
            "citations": citations
        }
    except Exception as e:
        print(f"[RAG Groq Error]: {e}, trying fallback model...")
        try:
            from groq import Groq
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model="qwen/qwen3.6-27b",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                temperature=0.3,
                max_tokens=600
            )
            answer = response.choices[0].message.content
            return {
                "answer": answer,
                "citations": citations
            }
        except Exception as e2:
            return {
                "answer": f"I encountered an error analyzing your library: {str(e2)}",
                "citations": citations
            }
