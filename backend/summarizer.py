import os
import json
import re
from typing import Dict, Any, List, Optional
from backend.config import settings

# Standardized Categories
CATEGORIES = [
    "Tech & AI",
    "Career & Business",
    "Finance & Investing",
    "Productivity & Mindset",
    "Fitness & Health",
    "Recipes & Food",
    "Learning & Books",
    "Design & Creativity",
    "Entertainment & Humor",
    "General Knowledge"
]

def clean_json_response(raw_text: str) -> Dict[str, Any]:
    """Cleans and extracts JSON payload from LLM responses."""
    text = raw_text.strip()
    # Find JSON block if wrapped in markdown code fence
    match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', text, re.DOTALL)
    if match:
        text = match.group(1)
    else:
        # Fallback to finding first { to last }
        first_brace = text.find('{')
        last_brace = text.rfind('}')
        if first_brace != -1 and last_brace != -1:
            text = text[first_brace:last_brace+1]

    try:
        return json.loads(text)
    except Exception as e:
        print(f"[JSON Parse Error]: {e}, raw text: {raw_text[:200]}")
        return {}

def extract_reel_insights(transcript_text: str, title: Optional[str] = None) -> Dict[str, Any]:
    """
    Uses Groq LLaMA to generate:
    1. 2-sentence summary
    2. 3-4 Key bullet points
    3. Standardized Category
    4. 3-5 Topical Tags
    5. Action items (tools, promo codes, steps, links)
    """
    if not transcript_text or len(transcript_text.strip()) < 10:
        return {
            "summary": "Short or non-verbal media clip.",
            "key_points": [],
            "category": "General Knowledge",
            "tags": ["#reel", "#short"],
            "action_items": []
        }

    api_key = settings.GROQ_API_KEY
    if not api_key:
        print("[Summarizer] No GROQ_API_KEY found, returning fallback.")
        return {
            "summary": transcript_text[:180] + "...",
            "key_points": [],
            "category": "General Knowledge",
            "tags": ["#reel"],
            "action_items": []
        }

    prompt = f"""You are an elite AI knowledge extraction engine for Instagram Reels.
Analyze the following transcript from an Instagram Reel and extract structured insights.

Transcript:
\"\"\"{transcript_text}\"\"\"

Video Title / Context: {title or 'Instagram Reel'}

You MUST output ONLY a valid JSON object matching this exact schema:
{{
  "summary": "Crisp, informative 2-sentence summary of the main insight.",
  "key_points": [
    "Key actionable takeaway or fact 1",
    "Key actionable takeaway or fact 2",
    "Key actionable takeaway or fact 3"
  ],
  "category": "Choose exactly ONE from: [Tech & AI, Career & Business, Finance & Investing, Productivity & Mindset, Fitness & Health, Recipes & Food, Learning & Books, Design & Creativity, Entertainment & Humor, General Knowledge]",
  "tags": ["#tag1", "#tag2", "#tag3"],
  "action_items": [
    {{"type": "tool", "text": "Name of tool/app mentioned if any"}},
    {{"type": "promo_code", "text": "Discount code / coupon if mentioned"}},
    {{"type": "step", "text": "Key rule, step or action to take"}}
  ]
}}
Do NOT output any intro or outro markdown, only the JSON block."""

    try:
        from groq import Groq
        client = Groq(api_key=api_key)
        response = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[
                {"role": "system", "content": "You are a precise JSON-only metadata extraction assistant. Output strictly valid JSON."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.2,
            max_tokens=2048,
            response_format={"type": "json_object"}
        )
        
        raw_content = response.choices[0].message.content
        data = clean_json_response(raw_content)
        if data and "summary" in data:
            # Validate category
            category = data.get("category", "General Knowledge")
            if category not in CATEGORIES:
                for cat in CATEGORIES:
                    if cat.lower() in category.lower():
                        data["category"] = cat
                        break
                else:
                    data["category"] = "General Knowledge"
            return data

    except Exception as e:
        print(f"[Summarizer Groq GPT-OSS Error]: {e}, trying fallback model...")
        try:
            from groq import Groq
            client = Groq(api_key=api_key)
            response = client.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {"role": "system", "content": "Extract insights strictly in JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=2048,
                response_format={"type": "json_object"}
            )
            raw_content = response.choices[0].message.content
            data = clean_json_response(raw_content)
            if data and "summary" in data:
                return data
        except Exception as e2:
            print(f"[Summarizer Fallback Error]: {e2}")
            return {
                "summary": transcript_text[:180] + "...",
                "key_points": [],
                "category": "General Knowledge",
                "tags": ["#reel"],
                "action_items": []
            }

# Backward compatibility alias
def summarize_transcript(transcript_text: str, title: Optional[str] = None) -> tuple:
    insights = extract_reel_insights(transcript_text, title)
    return insights.get("summary", ""), insights.get("key_points", [])
