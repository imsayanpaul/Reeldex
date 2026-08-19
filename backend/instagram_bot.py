import re
import httpx
from typing import Optional, List, Dict, Any
from backend.config import settings

def extract_reel_urls_from_text(text: str) -> List[str]:
    """Find all Instagram reel / post URLs in a given text message."""
    pattern = r"https?://(?:www\.)?instagram\.com/(?:reel|reels|p|share/reel)/[A-Za-z0-9_-]+/?(?:\?[^\s]*)?"
    matches = re.findall(pattern, text)
    return matches

async def send_instagram_dm(recipient_id: str, message_text: str) -> bool:
    """
    Sends a Direct Message to an Instagram user using Instagram Graph API.
    Supports both graph.instagram.com and graph.facebook.com.
    """
    if not settings.INSTAGRAM_PAGE_ACCESS_TOKEN:
        print("[Instagram Bot] Cannot send DM: INSTAGRAM_PAGE_ACCESS_TOKEN is not configured.")
        return False

    headers = {
        "Authorization": f"Bearer {settings.INSTAGRAM_PAGE_ACCESS_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "recipient": {"id": recipient_id},
        "message": {"text": message_text}
    }

    # Try graph.instagram.com first (for IG tokens), fallback to graph.facebook.com
    endpoints = [
        "https://graph.instagram.com/v21.0/me/messages",
        "https://graph.facebook.com/v21.0/me/messages"
    ]

    async with httpx.AsyncClient() as client:
        for url in endpoints:
            try:
                response = await client.post(url, json=payload, headers=headers, timeout=12.0)
                if response.status_code == 200:
                    print(f"[Instagram Bot] Successfully sent automated DM reply to {recipient_id} via {url}")
                    return True
                else:
                    print(f"[Instagram Bot] Endpoint {url} status: {response.status_code} - {response.text}")
            except Exception as e:
                print(f"[Instagram Bot] Error calling {url}: {e}")

    return False

def parse_webhook_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Parses incoming Meta Webhook payload for Instagram messaging events.
    Supports both `entry.messaging` and `entry.changes` formats.
    """
    results = []
    
    entries = payload.get("entry", [])
    for entry in entries:
        account_id = entry.get("id") # The Instagram Business Account ID (Bot)

        # Format A: entry.messaging
        events = entry.get("messaging", [])
        
        # Format B: entry.changes (Instagram Webhook format)
        changes = entry.get("changes", [])
        for ch in changes:
            if ch.get("field") == "messages" and "value" in ch:
                events.append(ch["value"])

        for event in events:
            # Skip delivery receipts and read receipts
            if "read" in event or "delivery" in event:
                continue

            message = event.get("message", {})
            if not message or not isinstance(message, dict):
                continue

            # CRITICAL: Skip outgoing echo messages sent by our bot
            if message.get("is_echo") or event.get("is_echo") or event.get("app_id"):
                continue

            sender_id = event.get("sender", {}).get("id") or event.get("sender_id") or "instagram_user"
            
            # CRITICAL: If the sender is our own bot/page account ID, ignore completely!
            if account_id and str(sender_id) == str(account_id):
                continue
            text = message.get("text", "")
            
            reel_urls = extract_reel_urls_from_text(text)
            
            # Shared attachments (ig_reel, share, video, etc.)
            attachments = message.get("attachments", [])
            for att in attachments:
                att_type = att.get("type", "")
                att_payload = att.get("payload", {})
                payload_url = att_payload.get("url") if isinstance(att_payload, dict) else None
                if not payload_url:
                    payload_url = att.get("url")
                
                if payload_url:
                    reel_urls.extend(extract_reel_urls_from_text(payload_url))
                elif isinstance(att_payload, dict) and att_payload.get("reel_video_id"):
                    # Fallback if URL is missing
                    reel_urls.append(f"https://www.instagram.com/reel/{att_payload.get('reel_video_id')}/")
            
            mid = message.get("mid")
            results.append({
                "message_id": mid,
                "sender_id": sender_id,
                "message_text": text,
                "reel_urls": list(set(reel_urls))
            })

    return results
