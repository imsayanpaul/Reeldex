import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  Sparkles, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Clock, 
  MessageSquare, 
  Bot, 
  Download, 
  Send,
  ArrowRight,
  FolderOpen,
  Share2,
  CheckCircle2,
  FileText
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

// Safe storage access for sandboxed WebViews
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
  const [selectedReel, setSelectedReel] = useState(null);

  // Ask AI Chat State
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi! I am ReelDex AI. Ask me anything across your saved Instagram Reels — like "What tools or promo codes were mentioned in my tech reels?" or "Summarize my saved career advice".'
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
    const interval = setInterval(fetchReels, 4000); // Live sync polling
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* ======================================================== */}
      {/* MODERN LINEAR-STYLE TOPBAR */}
      {/* ======================================================== */}
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(6, 7, 10, 0.85)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid var(--border-hairline)'
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '12px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }} className="header-content">
          
          {/* Brand & Live Sync Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', cursor: 'pointer' }} onClick={() => setActiveTab('vault')}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: '#0d111a',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Sparkles size={16} color="#818cf8" />
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: '700', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ReelDex
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '2px 7px', borderRadius: 'var(--radius-full)', background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <div className="pulse-indicator" />
                  <span style={{ fontSize: '0.65rem', fontWeight: '600', color: '#10b981', letterSpacing: '0.02em' }}>LIVE SYNC</span>
                </div>
              </div>
            </div>
          </div>

          {/* Segmented Switcher (Vault / Ask AI) */}
          <nav style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255, 255, 255, 0.03)',
            padding: '3px',
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-hairline)'
          }}>
            <button
              onClick={() => setActiveTab('vault')}
              className={`nav-segment ${activeTab === 'vault' ? 'active' : ''}`}
            >
              <FolderOpen size={14} /> Vault ({reels.length})
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`nav-segment ${activeTab === 'chat' ? 'active' : ''}`}
            >
              <Bot size={14} /> Ask AI
            </button>
          </nav>

          {/* Instagram Account Link / Status */}
          <div>
            {session?.is_instagram_linked ? (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                fontSize: '0.78rem',
                color: '#10b981',
                fontWeight: '600'
              }}>
                <InstagramIcon size={14} color="#10b981" />
                <span>@{session.instagram_username || 'Linked'}</span>
              </div>
            ) : (
              <button
                onClick={handleGeneratePairingCode}
                className="btn-solid"
                disabled={pairingLoading}
              >
                <InstagramIcon size={13} /> Connect Instagram
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN VIEWPORT CONTAINER */}
      {/* ======================================================== */}
      <main style={{ maxWidth: '1200px', width: '100%', margin: '0 auto', padding: '24px 20px', flex: 1 }}>

        {/* TAB 1: KNOWLEDGE VAULT */}
        {activeTab === 'vault' && (
          <div>
            
            {/* Command-Bar Omnisearch */}
            <div style={{ marginBottom: '18px' }}>
              <div className="command-bar">
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search across transcripts, tools, creators, and summaries..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="command-input"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.75rem', padding: '2px 6px' }}
                  >
                    Clear
                  </button>
                )}
              </div>

              {/* Horizontal Category Chips */}
              <div className="no-scrollbar" style={{ display: 'flex', gap: '6px', overflowX: 'auto', marginTop: '10px', paddingBottom: '2px' }}>
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`filter-chip ${selectedCategory === cat ? 'active' : ''}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Results Title Bar */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--text-primary)' }}>
                  {selectedCategory === 'All' ? 'All Saved Knowledge' : selectedCategory}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'rgba(255, 255, 255, 0.04)', padding: '1px 6px', borderRadius: '4px' }}>
                  {reels.length}
                </span>
              </div>

              {searchQuery && (
                <span style={{ fontSize: '0.74rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={12} /> Semantic Search Active
                </span>
              )}
            </div>

            {/* Reel Cards Grid / Anti-Slop Empty State */}
            {reels.length === 0 ? (
              <div className="reeldex-card" style={{ padding: '40px 24px', textAlign: 'center', maxWidth: '640px', margin: '30px auto' }}>
                <div style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 16px'
                }}>
                  <InstagramIcon size={22} color="#818cf8" />
                </div>
                
                <h3 style={{ fontSize: '1.15rem', fontWeight: '700', letterSpacing: '-0.02em', marginBottom: '8px' }}>
                  Your Knowledge Vault is Ready
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: '1.6', marginBottom: '24px', maxWidth: '480px', margin: '0 auto 24px' }}>
                  Turn Instagram into your second brain. Send any Reel in DM to <strong>@reeldex.io</strong> — it will instantly transcribe audio, extract insights, and organize it here.
                </p>

                {/* 3-Step Flow Pills */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
                  gap: '10px',
                  textAlign: 'left',
                  marginBottom: '26px'
                }}>
                  <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#818cf8', textTransform: 'uppercase' }}>Step 1</span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Connect your Instagram account below</p>
                  </div>
                  <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#818cf8', textTransform: 'uppercase' }}>Step 2</span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Share any Reel in DM to <strong>@reeldex.io</strong></p>
                  </div>
                  <div style={{ padding: '12px 14px', borderRadius: '8px', background: 'rgba(255, 255, 255, 0.02)', border: '1px solid var(--border-hairline)' }}>
                    <span style={{ fontSize: '0.7rem', fontWeight: '700', color: '#818cf8', textTransform: 'uppercase' }}>Step 3</span>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>Search, transcribe, and ask AI questions</p>
                  </div>
                </div>

                <button onClick={handleGeneratePairingCode} className="btn-solid" style={{ padding: '9px 20px' }}>
                  <InstagramIcon size={14} /> Connect Instagram Account
                </button>
              </div>
            ) : (
              <div className="reels-grid-layout" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
                {reels.map((reel) => (
                  <div
                    key={reel.id}
                    className="reeldex-card reeldex-card-interactive"
                    style={{ padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                    onClick={() => openReelDetail(reel)}
                  >
                    <div>
                      {/* Card Header: Category & Timestamp */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span className="badge-category">
                          {reel.category || 'General'}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {reel.created_at ? new Date(reel.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                          </span>
                          <button
                            onClick={(e) => handleDeleteReel(reel.id, e)}
                            style={{ background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer', padding: '2px' }}
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Title & Creator */}
                      <h4 style={{ fontSize: '0.98rem', fontWeight: '600', letterSpacing: '-0.01em', color: '#ffffff', marginBottom: '4px', lineHeight: '1.4' }}>
                        {reel.title || `Reel by @${reel.author || 'Creator'}`}
                      </h4>
                      
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                        by @{reel.author || reel.sender_username || 'creator'} {reel.duration ? `• ${Math.round(reel.duration)}s` : ''}
                      </div>

                      {/* AI Summary Preview */}
                      <p style={{
                        fontSize: '0.84rem',
                        color: 'var(--text-secondary)',
                        lineHeight: '1.5',
                        marginBottom: '12px',
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {formatSummary(reel.summary) || reel.preview_text || 'Transcribing audio...'}
                      </p>

                      {/* Action Item Pill */}
                      {reel.action_items?.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
                          <span className="badge-action-item">
                            🛠️ {formatActionItem(reel.action_items[0])}
                          </span>
                        </div>
                      )}

                      {/* Tags */}
                      {reel.tags?.length > 0 && (
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '12px' }}>
                          {reel.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="badge-tag">
                              {formatTag(tag)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Card Footer Actions */}
                    <div style={{
                      borderTop: '1px solid var(--border-hairline)',
                      paddingTop: '10px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      fontSize: '0.74rem',
                      color: 'var(--text-muted)'
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#818cf8' }}>
                        <Clock size={12} /> View Transcript
                      </span>
                      <ArrowRight size={13} color="var(--text-muted)" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ASK AI CONVERSATION */}
        {activeTab === 'chat' && (
          <div style={{ maxWidth: '740px', margin: '0 auto', display: 'flex', flexDirection: 'column', height: 'calc(100vh - 140px)' }}>
            
            {/* Messages Feed */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', paddingRight: '4px', marginBottom: '16px' }}>
              {chatMessages.map((msg, index) => (
                <div
                  key={index}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: msg.role === 'user' ? '82%' : '100%',
                    padding: msg.role === 'user' ? '10px 16px' : '16px 20px',
                    borderRadius: 'var(--radius-md)',
                    background: msg.role === 'user' ? 'var(--accent-indigo)' : 'var(--bg-surface-elevated)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border-hairline)',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    lineHeight: '1.6'
                  }}
                >
                  <div style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</div>

                  {/* Citations / Referenced Reel Chips */}
                  {msg.citations && msg.citations.length > 0 && (
                    <div style={{ marginTop: '12px', borderTop: '1px solid var(--border-hairline)', paddingTop: '10px' }}>
                      <span style={{ fontSize: '0.7rem', fontWeight: '600', color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Referenced Reels:
                      </span>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px' }}>
                        {msg.citations.map((c, i) => (
                          <button
                            key={i}
                            onClick={() => openReelDetail(c)}
                            className="btn-subtle"
                            style={{ fontSize: '0.74rem', padding: '4px 10px' }}
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
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-surface-elevated)',
                  border: '1px solid var(--border-hairline)',
                  fontSize: '0.84rem',
                  color: '#818cf8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <Sparkles size={14} className="animate-spin" /> Synthesizing across your saved Reels...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Suggested Prompts */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {[
                "What tools or promo codes were mentioned?",
                "Summarize all job advice I saved",
                "List all productivity rules"
              ].map((prompt, idx) => (
                <button
                  key={idx}
                  onClick={() => setChatQuestion(prompt)}
                  style={{
                    fontSize: '0.74rem',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-full)',
                    background: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid var(--border-hairline)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer'
                  }}
                >
                  ✨ {prompt}
                </button>
              ))}
            </div>

            {/* Chat Input Bar */}
            <form onSubmit={handleAskAI} style={{ display: 'flex', gap: '8px' }}>
              <div className="command-bar" style={{ flex: 1, padding: '10px 14px' }}>
                <input
                  type="text"
                  placeholder="Ask a question across all your saved Reels..."
                  value={chatQuestion}
                  onChange={(e) => setChatQuestion(e.target.value)}
                  className="command-input"
                  style={{ margin: 0 }}
                />
              </div>
              <button type="submit" disabled={chatLoading || !chatQuestion.trim()} className="btn-solid" style={{ padding: '0 18px' }}>
                <Send size={14} />
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
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '8px', background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <InstagramIcon size={18} color="#818cf8" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: '700', letterSpacing: '-0.01em' }}>Connect Your Instagram</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sync your ReelDex library in 10 seconds</p>
                </div>
              </div>
              <button onClick={() => setShowPairModal(false)} className="btn-subtle" style={{ padding: '4px 8px' }}>✕</button>
            </div>

            <div style={{ background: 'var(--bg-app)', border: '1px solid var(--border-hairline)', borderRadius: 'var(--radius-md)', padding: '20px', textAlign: 'center', marginBottom: '18px' }}>
              <span style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Your Unique Linking Code
              </span>
              <div style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', color: '#ffffff', margin: '8px 0' }}>
                {pairingCode || 'MIND-849201'}
              </div>
              <button onClick={() => copyText(pairingCode)} className="btn-subtle" style={{ fontSize: '0.78rem' }}>
                {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />} Copy Code
              </button>
            </div>

            <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '20px' }}>
              <ol style={{ paddingLeft: '18px' }}>
                <li>Open Instagram and open DM with <strong>@reeldex.io</strong>.</li>
                <li>Send your 6-digit code: <code style={{ color: '#818cf8', fontFamily: 'var(--font-mono)' }}>{pairingCode}</code></li>
                <li>You're connected! Any Reel you share in DM will automatically sync here.</li>
              </ol>
            </div>

            <a
              href="https://ig.me/m/reeldex.io"
              target="_blank"
              rel="noreferrer"
              className="btn-solid"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Open Instagram DM <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* REEL DETAIL & FULL TRANSCRIPT MODAL */}
      {/* ======================================================== */}
      {selectedReel && (
        <div className="modal-overlay" onClick={() => setSelectedReel(null)}>
          <div className="modal-dialog" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <span className="badge-category">
                  {selectedReel.category || 'General'}
                </span>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700', letterSpacing: '-0.02em', marginTop: '6px', color: '#ffffff' }}>
                  {selectedReel.title || `Reel by @${selectedReel.author || 'Creator'}`}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  by @{selectedReel.author || selectedReel.sender_username} {selectedReel.duration ? `• ${Math.round(selectedReel.duration)}s` : ''}
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => copyText(selectedReel.transcript?.full_text || selectedReel.preview_text || '')}
                  className="btn-subtle"
                  title="Copy Transcript"
                >
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                </button>
                {selectedReel.transcript && (
                  <button
                    onClick={() => downloadSRT(selectedReel)}
                    className="btn-subtle"
                    title="Download .SRT"
                  >
                    <Download size={14} /> .SRT
                  </button>
                )}
                {selectedReel.reel_url && (
                  <a
                    href={selectedReel.reel_url}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-subtle"
                    title="Open on Instagram"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <button onClick={() => setSelectedReel(null)} className="btn-subtle">✕</button>
              </div>
            </div>

            {/* AI Summary Box */}
            {selectedReel.transcript?.summary && (
              <div style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(99, 102, 241, 0.05)',
                border: '1px solid rgba(99, 102, 241, 0.15)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.78rem', fontWeight: '700', color: '#818cf8', marginBottom: '6px' }}>
                  <Sparkles size={14} /> AI SUMMARY & KEY TAKEAWAYS
                </div>
                <p style={{ fontSize: '0.86rem', color: '#e2e8f0', lineHeight: '1.6', marginBottom: selectedReel.transcript.key_points?.length ? '10px' : '0' }}>
                  {formatSummary(selectedReel.transcript.summary)}
                </p>

                {selectedReel.transcript.key_points?.length > 0 && (
                  <ul style={{ paddingLeft: '18px', fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: '1.6' }}>
                    {selectedReel.transcript.key_points.map((pt, i) => (
                      <li key={i} style={{ marginBottom: '3px' }}>{formatSummary(pt)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Extracted Actions & Tools */}
            {selectedReel.action_items?.length > 0 && (
              <div style={{
                padding: '12px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(56, 189, 248, 0.04)',
                border: '1px solid rgba(56, 189, 248, 0.15)',
                marginBottom: '16px'
              }}>
                <div style={{ fontSize: '0.74rem', fontWeight: '700', color: '#7dd3fc', marginBottom: '6px' }}>
                  🛠️ EXTRACTED TOOLS, PROMOS & ACTION ITEMS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  {selectedReel.action_items.map((act, i) => (
                    <div key={i} style={{ fontSize: '0.8rem', color: '#e0f2fe' }}>
                      • {formatActionItem(act)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Word-For-Word Transcript */}
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                FULL WORD-FOR-WORD TRANSCRIPT
              </div>
              <div style={{
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-app)',
                border: '1px solid var(--border-hairline)',
                fontSize: '0.85rem',
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
                  <div style={{ fontSize: '0.78rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    TIMESTAMPS ({segs.length})
                  </div>
                  <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {segs.map((seg, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '10px',
                          padding: '6px 10px',
                          borderRadius: 'var(--radius-xs)',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid var(--border-hairline)',
                          fontSize: '0.8rem'
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: '#818cf8', minWidth: '60px' }}>
                          {Math.floor(seg.start || 0)}s - {Math.floor(seg.end || seg.start + 2)}s
                        </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{seg.text}</span>
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
