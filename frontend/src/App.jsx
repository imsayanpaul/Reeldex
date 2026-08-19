import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Sparkles, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Clock, 
  Bot, 
  Download, 
  Send,
  ArrowRight,
  FolderOpen,
  X,
  Play,
  Zap,
  Bookmark
} from 'lucide-react';

const InstagramIcon = ({ size = 16, color = "currentColor", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

// Safe formatting helpers
const formatActionItem = (item) => {
  if (!item) return '';
  if (typeof item === 'string') return item;
  if (typeof item === 'object') {
    return item.text || item.value || item.name || item.title || item.action || item.item || JSON.stringify(item);
  }
  return String(item);
};

const formatTag = (tag) => {
  if (!tag) return '';
  if (typeof tag === 'string') return tag;
  if (typeof tag === 'object') return tag.tag || tag.name || tag.label || JSON.stringify(tag);
  return String(tag);
};

const formatSummary = (summary) => {
  if (!summary) return '';
  if (typeof summary === 'string') return summary;
  if (typeof summary === 'object') return summary.summary || summary.text || JSON.stringify(summary);
  return String(summary);
};

// Safe storage access
const getSafeStorage = (key) => {
  try {
    return window.localStorage?.getItem(key);
  } catch (e) {
    return null;
  }
};

const setSafeStorage = (key, val) => {
  try {
    window.localStorage?.setItem(key, val);
  } catch (e) {}
};

const getInitialToken = () => {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    if (tokenFromUrl) {
      setSafeStorage('reelmind_token', tokenFromUrl);
      return tokenFromUrl;
    }
    return getSafeStorage('reelmind_token') || '';
  } catch (e) {
    return '';
  }
};

const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/+$/, '') : 'https://reeldex-api.onrender.com') + '/api';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('vault'); // 'vault' | 'chat'

  // User & Pairing State
  const initialToken = getInitialToken();
  const [session, setSession] = useState({ auth_token: initialToken, display_name: 'ReelDex User' });
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Vault & Search State
  const [reels, setReels] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState(['AI Tools', 'Career Advice', 'Fitness']);
  const [selectedReel, setSelectedReel] = useState(null);

  // Ask AI Chat State
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi! I am ReelDex AI. Ask me anything across your saved Instagram Reels — like "What tools or promo codes were mentioned?" or "Summarize all fitness rules I saved".'
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

  // Utility State
  const [copied, setCopied] = useState(false);

  // 1. Initialize User Session
  useEffect(() => {
    const currentToken = getInitialToken();

    fetch(`${API_BASE}/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: currentToken })
    })
      .then(res => res.json())
      .then(data => {
        if (data && data.auth_token) {
          setSession(data);
          setSafeStorage('reelmind_token', data.auth_token);
        }
      })
      .catch(err => console.error('Session error:', err));

    fetchCategories();
    fetchReels(currentToken);
  }, []);

  // 2. Fetch Reels when Category or Search Query Changes
  useEffect(() => {
    fetchReels();
    const interval = setInterval(fetchReels, 4000);
    return () => clearInterval(interval);
  }, [session?.auth_token, selectedCategory, searchQuery]);

  useEffect(() => {
    if (activeTab === 'chat' && chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_BASE}/categories`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || ['All']);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchReels = async (overrideToken) => {
    try {
      const token = overrideToken !== undefined ? overrideToken : (session?.auth_token || getSafeStorage('reelmind_token') || '');
      let url = `${API_BASE}/reels?token=${token}&category=${encodeURIComponent(selectedCategory)}`;
      if (searchQuery.trim()) {
        url += `&q=${encodeURIComponent(searchQuery.trim())}`;
      }
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setReels(data);
      }
    } catch (err) {
      console.error('Error fetching reels:', err);
    }
  };

  const handleGeneratePairingCode = async () => {
    setPairingLoading(true);
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/auth/pair-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      const data = await res.json();
      setPairingCode(data.code);
      setShowPairModal(true);
    } catch (err) {
      console.error('Pairing error:', err);
    } finally {
      setPairingLoading(false);
    }
  };

  const handleDeleteReel = async (reelId, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this reel from your vault?')) return;
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/reels/${reelId}?token=${token}`, { method: 'DELETE' });
      if (res.ok) {
        setReels(prev => prev.filter(r => r.id !== reelId));
        if (selectedReel?.id === reelId) setSelectedReel(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const openReelDetail = async (reel) => {
    try {
      const idToFetch = reel.id || reel.reel_id;
      if (!idToFetch) {
        setSelectedReel(reel);
        return;
      }
      const res = await fetch(`${API_BASE}/reels/${idToFetch}`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedReel(detail);
      } else {
        setSelectedReel(reel);
      }
    } catch (err) {
      setSelectedReel(reel);
    }
  };

  const handleAskAI = async (e) => {
    if (e) e.preventDefault();
    if (!chatQuestion.trim()) return;

    const userMsg = { role: 'user', content: chatQuestion };
    setChatMessages(prev => [...prev, userMsg]);
    setChatQuestion('');
    setChatLoading(true);

    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg.content, token })
      });
      const data = await res.json();
      const aiMsg = {
        role: 'assistant',
        content: data.answer,
        citations: data.citations || []
      };
      setChatMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: '⚠️ Sorry, I encountered an error searching your knowledge base. Please check your connection and try again.' }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const copyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSRT = (reel) => {
    let segs = [];
    try {
      if (Array.isArray(reel.transcript?.segments)) {
        segs = reel.transcript.segments;
      } else if (typeof reel.transcript?.segments === 'string') {
        segs = JSON.parse(reel.transcript.segments);
      }
    } catch (e) {
      segs = [];
    }

    if (!segs || segs.length === 0) return;

    const formatSRTTime = (seconds) => {
      const date = new Date(0);
      date.setSeconds(seconds);
      const ms = Math.floor((seconds % 1) * 1000);
      return date.toISOString().substr(11, 8) + ',' + ms.toString().padStart(3, '0');
    };

    let srt = '';
    segs.forEach((seg, i) => {
      srt += `${i + 1}\n`;
      srt += `${formatSRTTime(seg.start || 0)} --> ${formatSRTTime(seg.end || seg.start + 2)}\n`;
      srt += `${(seg.text || '').trim()}\n\n`;
    });

    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reel_${reel.shortcode || reel.id}_subtitles.srt`;
    link.click();
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--bg-page)' }}>
      
      {/* ======================================================== */}
      {/* TOPBAR NAVIGATION */}
      {/* ======================================================== */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid var(--border-light)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div style={{
          maxWidth: '1240px',
          margin: '0 auto',
          padding: '14px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          
          {/* Brand Logo Wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setActiveTab('vault')}>
            <div style={{ fontSize: '1.45rem', fontWeight: '900', letterSpacing: '-0.04em', color: '#0f172a' }}>
              Reel<span style={{ color: '#ff5722' }}>Dex</span>
            </div>
          </div>

          {/* Capsule Tab Switcher */}
          <nav className="nav-capsule">
            <button
              onClick={() => setActiveTab('vault')}
              className={`nav-capsule-item ${activeTab === 'vault' ? 'active' : ''}`}
            >
              • Search & Vault
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`nav-capsule-item ${activeTab === 'chat' ? 'active' : ''}`}
            >
              Ask AI <span style={{ fontSize: '0.68rem', background: activeTab === 'chat' ? '#ffffff' : 'rgba(255, 87, 34, 0.1)', color: activeTab === 'chat' ? '#ff5722' : '#ff5722', padding: '1px 5px', borderRadius: '4px', fontWeight: '800' }}>AI</span>
            </button>
          </nav>

          {/* User Account / Connect Instagram */}
          <div>
            {session?.is_instagram_linked ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 12px 5px 6px',
                borderRadius: 'var(--radius-full)',
                background: '#ffffff',
                border: '1px solid var(--border-light)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  background: '#ff5722',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.75rem',
                  fontWeight: '800'
                }}>
                  {session.instagram_username ? session.instagram_username[0].toUpperCase() : 'S'}
                </div>
                <span style={{ fontSize: '0.82rem', fontWeight: '700', color: 'var(--text-dark)' }}>
                  @{session.instagram_username || 'Connected'}
                </span>
              </div>
            ) : (
              <button
                onClick={handleGeneratePairingCode}
                className="btn-coral"
                disabled={pairingLoading}
              >
                <InstagramIcon size={14} /> Connect Instagram
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN VIEWPORT CONTAINER */}
      {/* ======================================================== */}
      <main style={{ maxWidth: '1240px', width: '100%', margin: '0 auto', padding: '24px 20px 40px', flex: 1 }}>

        {/* TAB 1: KNOWLEDGE VAULT */}
        {activeTab === 'vault' && (
          <div>
            
            {/* HERO PROMOTIONAL BANNER (Appliqa Style) */}
            <div style={{
              background: 'linear-gradient(135deg, #ff5722 0%, #ee385c 100%)',
              borderRadius: 'var(--radius-xl)',
              boxShadow: 'var(--shadow-hero)',
              padding: '36px 40px',
              color: '#ffffff',
              display: 'grid',
              gridTemplateColumns: '1.25fr 0.75fr',
              gap: '24px',
              alignItems: 'center',
              marginBottom: '32px',
              position: 'relative',
              overflow: 'hidden'
            }} className="hero-container-grid">
              
              {/* Left Content */}
              <div>
                <h1 style={{
                  fontSize: 'clamp(1.8rem, 3.2vw, 2.6rem)',
                  fontWeight: '900',
                  lineHeight: '1.15',
                  letterSpacing: '-0.03em',
                  marginBottom: '14px'
                }}>
                  Turn Saved Reels.<br />
                  Into Second Brain.<br />
                  All in One Place.
                </h1>

                <p style={{
                  fontSize: '0.92rem',
                  lineHeight: '1.6',
                  color: 'rgba(255, 255, 255, 0.9)',
                  maxWidth: '520px',
                  marginBottom: '24px'
                }}>
                  Stop losing valuable advice in your Instagram saved folder. Automatically transcribe audio, extract tools & action items, and search everything with AI.
                </p>

                {/* Search Bar inside Hero */}
                <div style={{
                  background: '#ffffff',
                  borderRadius: 'var(--radius-full)',
                  padding: '6px 8px 6px 18px',
                  display: 'flex',
                  alignItems: 'center',
                  boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                  maxWidth: '520px',
                  marginBottom: '12px'
                }}>
                  <Search size={18} color="#94a3b8" />
                  <input
                    type="text"
                    placeholder="Search transcripts, tools, creators, or topics..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      border: 'none',
                      outline: 'none',
                      width: '100%',
                      padding: '8px 12px',
                      fontSize: '0.88rem',
                      fontFamily: 'inherit',
                      color: '#0f172a'
                    }}
                  />
                  
                  <button
                    onClick={() => fetchReels()}
                    className="btn-dark"
                    style={{ padding: '8px 18px' }}
                  >
                    Search <ArrowRight size={14} />
                  </button>
                </div>

                {/* Recent Searches Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', fontSize: '0.74rem' }}>
                  <span style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={12} /> Recent:
                  </span>
                  {recentSearches.map((s, idx) => (
                    <button
                      key={idx}
                      onClick={() => setSearchQuery(s)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.18)',
                        border: 'none',
                        color: '#ffffff',
                        padding: '3px 10px',
                        borderRadius: 'var(--radius-full)',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '0.74rem'
                      }}
                    >
                      {s}
                    </button>
                  ))}
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{ background: 'none', border: 'none', color: '#ffffff', textDecoration: 'underline', cursor: 'pointer', fontSize: '0.72rem' }}
                    >
                      Clear search
                    </button>
                  )}
                </div>
              </div>

              {/* Right Image Cutout */}
              <div style={{ display: 'flex', justifyContent: 'center', position: 'relative' }} className="hero-image-column">
                <div style={{
                  position: 'relative',
                  width: '280px',
                  height: '280px',
                  borderRadius: '24px',
                  overflow: 'hidden',
                  boxShadow: '0 12px 32px rgba(0, 0, 0, 0.25)',
                  border: '3px solid rgba(255, 255, 255, 0.3)'
                }}>
                  <img
                    src="/hero-creator.jpg"
                    alt="ReelDex Creator"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  {/* Floating live badge */}
                  <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '12px',
                    right: '12px',
                    background: 'rgba(15, 23, 42, 0.85)',
                    backdropFilter: 'blur(8px)',
                    padding: '8px 12px',
                    borderRadius: '12px',
                    color: '#ffffff',
                    fontSize: '0.74rem',
                    fontWeight: '700',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Zap size={14} color="#ff5722" /> Groq Whisper Speech AI
                    </span>
                    <span style={{ color: '#10b981', fontSize: '0.7rem' }}>~1s Sync</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Title Bar & Categories Filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                  {selectedCategory === 'All' ? 'All Saved Knowledge' : selectedCategory}
                </h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {reels.length} {reels.length === 1 ? 'Reel' : 'Reels'} stored in your personal vault
                </p>
              </div>

              {/* Category Pills */}
              <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', maxWidth: '100%' }} className="no-scrollbar">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`trending-chip ${selectedCategory === cat ? 'active' : ''}`}
                    style={{ padding: '6px 14px' }}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Reel Cards Grid / Empty State */}
            {reels.length === 0 ? (
              <div className="clean-card" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '640px', margin: '30px auto' }}>
                <div style={{
                  width: '54px',
                  height: '54px',
                  borderRadius: '16px',
                  background: 'rgba(255, 87, 34, 0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <Bookmark size={26} color="#ff5722" />
                </div>
                
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-heading)', marginBottom: '8px' }}>
                  Your Knowledge Vault is Ready
                </h3>
                <p style={{ color: 'var(--text-body)', fontSize: '0.88rem', lineHeight: '1.6', marginBottom: '24px', maxWidth: '440px', margin: '0 auto 24px' }}>
                  Send any Instagram Reel in DM to <strong>@reeldex.io</strong>. Our AI engine will transcribe speech, extract tools, and file it here automatically!
                </p>

                <button onClick={handleGeneratePairingCode} className="btn-coral" style={{ padding: '10px 24px' }}>
                  <InstagramIcon size={15} /> Connect Your Instagram
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
                {reels.map((reel) => (
                  <div
                    key={reel.id}
                    className="clean-card clean-card-hover"
                    style={{ padding: '22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                    onClick={() => openReelDetail(reel)}
                  >
                    <div>
                      {/* Top Header: Category & Timestamp */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span className="pill-category">
                          {reel.category || 'General'}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600' }}>
                            {reel.created_at ? new Date(reel.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                          </span>
                          <button
                            onClick={(e) => handleDeleteReel(reel.id, e)}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Title & Author */}
                      <h4 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-heading)', letterSpacing: '-0.02em', marginBottom: '4px', lineHeight: '1.4' }}>
                        {reel.title || `Reel by @${reel.author || 'Creator'}`}
                      </h4>
                      
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '12px' }}>
                        by @{reel.author || reel.sender_username || 'creator'} {reel.duration ? `• ${Math.round(reel.duration)}s` : ''}
                      </div>

                      {/* AI Summary */}
                      <p style={{
                        fontSize: '0.86rem',
                        color: 'var(--text-body)',
                        lineHeight: '1.6',
                        marginBottom: '14px',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {formatSummary(reel.summary) || reel.preview_text || 'Transcribing spoken audio...'}
                      </p>

                      {/* Action Item Pill */}
                      {reel.action_items?.length > 0 && (
                        <div style={{ marginBottom: '12px' }}>
                          <span className="pill-tool">
                            🛠️ {formatActionItem(reel.action_items[0])}
                          </span>
                        </div>
                      )}

                      {/* Tags */}
                      {reel.tags?.length > 0 && (
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '12px' }}>
                          {reel.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} style={{
                              fontFamily: 'var(--font-mono)',
                              fontSize: '0.7rem',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              background: '#f1f5f9',
                              color: '#475569',
                              fontWeight: '600'
                            }}>
                              {formatTag(tag)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div style={{
                      borderTop: '1px solid var(--border-light)',
                      paddingTop: '12px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.78rem'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff5722', fontWeight: '700' }}>
                        <Clock size={13} /> View Transcript
                      </span>
                      <ArrowRight size={14} color="#ff5722" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ASK AI CONVERSATION */}
        {activeTab === 'chat' && (
          <div style={{ maxWidth: '780px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
            
            {/* Messages Feed */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '6px', marginBottom: '16px' }}>
              {chatMessages.map((msg, index) => (
                <div
                  key={index}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: msg.role === 'user' ? '80%' : '100%',
                    padding: msg.role === 'user' ? '12px 18px' : '18px 22px',
                    borderRadius: '18px',
                    background: msg.role === 'user' ? '#0f172a' : '#ffffff',
                    boxShadow: 'var(--shadow-md)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border-light)',
                    color: msg.role === 'user' ? '#ffffff' : 'var(--text-dark)',
                    fontSize: '0.9rem',
                    lineHeight: '1.6'
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                  {/* Referenced Citations */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div style={{ marginTop: '14px', borderTop: '1px solid var(--border-light)', paddingTop: '10px' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: '800', color: '#ff5722', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Referenced Reels:
                      </span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {msg.citations.map((c, i) => (
                          <button
                            key={i}
                            onClick={() => openReelDetail(c)}
                            className="btn-white"
                            style={{ fontSize: '0.76rem', padding: '4px 10px' }}
                          >
                            🎬 {c.title || `Reel #${c.reel_id || c.id}`}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {chatLoading && (
                <div style={{
                  alignSelf: 'flex-start',
                  padding: '12px 18px',
                  borderRadius: '14px',
                  background: '#ffffff',
                  boxShadow: 'var(--shadow-sm)',
                  border: '1px solid var(--border-light)',
                  fontSize: '0.86rem',
                  color: '#ff5722',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Sparkles size={16} className="animate-spin" /> Synthesizing across your saved Reels...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Suggested Inquiries */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {[
                "What tools or promo codes were mentioned?",
                "Summarize all career advice I saved",
                "List all fitness routines"
              ].map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => setChatQuestion(prompt)}
                  style={{
                    fontSize: '0.76rem',
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-full)',
                    background: '#ffffff',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text-body)',
                    fontWeight: '600',
                    cursor: 'pointer'
                  }}
                >
                  ✨ {prompt}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleAskAI} style={{ display: 'flex', gap: '10px' }}>
              <input
                type="text"
                placeholder="Ask a question across all your saved Reels..."
                value={chatQuestion}
                onChange={(e) => setChatQuestion(e.target.value)}
                style={{
                  flex: 1,
                  padding: '12px 18px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid var(--border-light)',
                  background: '#ffffff',
                  outline: 'none',
                  fontSize: '0.9rem',
                  boxShadow: 'var(--shadow-sm)'
                }}
              />
              <button type="submit" disabled={chatLoading || !chatQuestion.trim()} className="btn-coral" style={{ padding: '0 24px' }}>
                <Send size={16} />
              </button>
            </form>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* INSTAGRAM PAIRING MODAL */}
      {/* ======================================================== */}
      {showPairModal && (
        <div className="modal-overlay" onClick={() => setShowPairModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '12px', background: 'linear-gradient(135deg, #ff5722, #f43f5e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <InstagramIcon size={20} color="#fff" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-heading)' }}>Connect Your Instagram</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Sync your ReelDex library in 10 seconds</p>
                </div>
              </div>
              <button onClick={() => setShowPairModal(false)} className="btn-white" style={{ padding: '4px 8px' }}>✕</button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '24px', textAlign: 'center', marginBottom: '18px' }}>
              <span style={{ fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Your Unique Linking Code
              </span>
              <div style={{ fontSize: '2.2rem', fontWeight: '900', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', color: '#ff5722', margin: '8px 0' }}>
                {pairingCode || 'MIND-849201'}
              </div>
              <button onClick={() => copyText(pairingCode)} className="btn-white" style={{ fontSize: '0.8rem' }}>
                {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />} Copy Code
              </button>
            </div>

            <div style={{ fontSize: '0.86rem', color: 'var(--text-body)', lineHeight: '1.6', marginBottom: '22px' }}>
              <ol style={{ paddingLeft: '20px' }}>
                <li>Open Instagram and open DM with <strong>@reeldex.io</strong>.</li>
                <li>Send your code: <code style={{ color: '#ff5722', fontWeight: '700' }}>{pairingCode}</code></li>
                <li>You're connected! Any Reel you share in DM will automatically sync here.</li>
              </ol>
            </div>

            <a
              href="https://ig.me/m/reeldex.io"
              target="_blank"
              rel="noreferrer"
              className="btn-coral"
              style={{ width: '100%', justifyContent: 'center', padding: '12px' }}
            >
              Open Instagram DM <ExternalLink size={15} />
            </a>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* REEL DETAIL & FULL TRANSCRIPT MODAL */}
      {/* ======================================================== */}
      {selectedReel && (
        <div className="modal-overlay" onClick={() => setSelectedReel(null)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <span className="pill-category">
                  {selectedReel.category || 'General'}
                </span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-heading)', marginTop: '8px', letterSpacing: '-0.02em' }}>
                  {selectedReel.title || `Reel by @${selectedReel.author || 'Creator'}`}
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                  by @{selectedReel.author || selectedReel.sender_username} {selectedReel.duration ? `• ${Math.round(selectedReel.duration)}s` : ''}
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => copyText(selectedReel.transcript?.full_text || selectedReel.preview_text || '')}
                  className="btn-white"
                  title="Copy Transcript"
                >
                  {copied ? <Check size={15} color="#10b981" /> : <Copy size={15} />}
                </button>
                {selectedReel.transcript && (
                  <button
                    onClick={() => downloadSRT(selectedReel)}
                    className="btn-white"
                    title="Download .SRT"
                  >
                    <Download size={15} /> .SRT
                  </button>
                )}
                {selectedReel.reel_url && (
                  <a
                    href={selectedReel.reel_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-white"
                    title="Open on Instagram"
                  >
                    <ExternalLink size={15} />
                  </a>
                )}
                <button onClick={() => setSelectedReel(null)} className="btn-white">✕</button>
              </div>
            </div>

            {/* AI Summary Box */}
            {selectedReel.transcript?.summary && (
              <div style={{
                padding: '18px',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(255, 87, 34, 0.05)',
                border: '1px solid rgba(255, 87, 34, 0.15)',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '800', color: '#ff5722', marginBottom: '8px' }}>
                  <Sparkles size={15} /> AI SUMMARY & KEY TAKEAWAYS
                </div>
                <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', lineHeight: '1.6', marginBottom: selectedReel.transcript.key_points?.length ? '12px' : '0' }}>
                  {formatSummary(selectedReel.transcript.summary)}
                </p>

                {selectedReel.transcript.key_points?.length > 0 && (
                  <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-body)', lineHeight: '1.6' }}>
                    {selectedReel.transcript.key_points.map((pt, i) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{formatSummary(pt)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Extracted Tools & Actions */}
            {selectedReel.action_items?.length > 0 && (
              <div style={{
                padding: '14px 18px',
                borderRadius: 'var(--radius-md)',
                background: '#f8fafc',
                border: '1px solid var(--border-light)',
                marginBottom: '18px'
              }}>
                <div style={{ fontSize: '0.76rem', fontWeight: '800', color: '#0f172a', marginBottom: '6px' }}>
                  🛠️ EXTRACTED TOOLS, PROMOS & ACTION ITEMS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selectedReel.action_items.map((act, i) => (
                    <div key={i} style={{ fontSize: '0.84rem', color: 'var(--text-body)' }}>
                      • {formatActionItem(act)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Word-For-Word Transcript */}
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-heading)', marginBottom: '8px' }}>
                FULL WORD-FOR-WORD TRANSCRIPT
              </div>
              <div style={{
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: '#f8fafc',
                border: '1px solid var(--border-light)',
                fontSize: '0.86rem',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap'
              }}>
                {selectedReel.transcript?.full_text || selectedReel.preview_text || 'Transcription processing...'}
              </div>
            </div>

            {/* Timestamped Segments */}
            {(() => {
              let segs = [];
              try {
                if (Array.isArray(selectedReel.transcript?.segments)) {
                  segs = selectedReel.transcript.segments;
                } else if (typeof selectedReel.transcript?.segments === 'string') {
                  segs = JSON.parse(selectedReel.transcript.segments);
                }
              } catch (e) {
                segs = [];
              }

              if (!segs || segs.length === 0) return null;

              return (
                <div>
                  <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-heading)', marginBottom: '8px' }}>
                    TIMESTAMPS ({segs.length})
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    {segs.map((seg, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '10px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: '#f8fafc',
                          border: '1px solid var(--border-light)',
                          fontSize: '0.82rem'
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.74rem', color: '#ff5722', fontWeight: '700', minWidth: '60px' }}>
                          {Math.floor(seg.start || 0)}s - {Math.floor(seg.end || seg.start + 2)}s
                        </span>
                        <span style={{ color: 'var(--text-body)' }}>{seg.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
