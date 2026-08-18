import datetime
from sqlalchemy import Column, Integer, String, Text, DateTime, Float, Boolean, JSON, ForeignKey
from sqlalchemy.orm import relationship
from backend.database import Base

class User(Base):
    """Represents a registered or auto-onboarded ReelMind user."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=True)
    display_name = Column(String(100), default="ReelMind Explorer")
    instagram_sender_id = Column(String(100), unique=True, index=True, nullable=True)
    instagram_username = Column(String(100), nullable=True)
    auth_token = Column(String(255), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    reels = relationship("ReelItem", back_populates="user", cascade="all, delete-orphan")
    pairing_codes = relationship("PairingCode", back_populates="user", cascade="all, delete-orphan")


class PairingCode(Base):
    """Temporary 6-digit codes used to link Instagram accounts to web users."""
    __tablename__ = "pairing_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(20), unique=True, index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="pairing_codes")


class ReelItem(Base):
    """Represents a processed Instagram reel in a user's vault."""
    __tablename__ = "reels"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    reel_url = Column(String(500), nullable=False)
    shortcode = Column(String(100), index=True)
    title = Column(String(300), nullable=True)
    author = Column(String(100), nullable=True)
    thumbnail_url = Column(String(1000), nullable=True)
    duration = Column(Float, nullable=True)
    
    # Metadata & Source
    source = Column(String(50), default="web_ui")  # "web_ui" or "instagram_dm"
    sender_id = Column(String(100), nullable=True)  # Instagram sender ID
    sender_username = Column(String(100), nullable=True)
    
    # AI Categorization & Insights
    category = Column(String(100), default="General", index=True)  # Tech & AI, Career & Jobs, Finance, etc.
    tags = Column(JSON, default=list)  # ["#remote-work", "#ai-agents"]
    action_items = Column(JSON, default=list)  # [{"type": "tool", "name": "Vicee"}, {"type": "code", "value": "SINGIN USA"}]

    # Processing Status
    status = Column(String(50), default="pending")  # pending, downloading, transcribing, completed, failed
    error_message = Column(Text, nullable=True)
    dm_replied = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="reels")
    transcript = relationship("Transcript", back_populates="reel", uselist=False, cascade="all, delete-orphan")


class Transcript(Base):
    """Holds word-for-word transcript, timestamps, and AI summary."""
    __tablename__ = "transcripts"

    id = Column(Integer, primary_key=True, index=True)
    reel_id = Column(Integer, ForeignKey("reels.id"), unique=True, nullable=False)
    
    full_text = Column(Text, nullable=False)
    language = Column(String(20), default="en")
    summary = Column(Text, nullable=True)
    key_points = Column(JSON, default=list)
    segments = Column(JSON, default=list)  # [{"start": 0.0, "end": 2.5, "text": "..."}]

    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationship
    reel = relationship("ReelItem", back_populates="transcript")
