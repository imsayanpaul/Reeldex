import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  Search, 
  Layers, 
  MessageSquare, 
  PlusCircle, 
  Settings, 
  Check, 
  Copy, 
  Download, 
  Trash2, 
  ExternalLink, 
  Bot, 
  Zap, 
  Link as LinkIcon, 
  Clock, 
  Tag, 
  ChevronRight, 
  Sliders, 
  HelpCircle,
  FolderOpen
} from 'lucide-react';

const InstagramIcon = ({ size = 18, color = "currentColor", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

const API_BASE = (import.meta.env.VITE_API_URL ? import.meta.env.VITE_API_URL.replace(/\/+$/, '') : '') + '/api';

export default function App() {
  // Navigation State
  const [activeTab, setActiveTab] = useState('vault'); // 'vault' | 'chat' | 'transcribe' | 'settings'

  // User & Pairing State
  const [session, setSession] = useState(null);
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Vault & Search State
  const [reels, setReels] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingReels, setLoadingReels] = useState(false);
  const [selectedReel, setSelectedReel] = useState(null);

  // Ask AI Chat State
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi! I am ReelDex AI. You can ask me anything across all the Instagram Reels you have saved in your library (e.g., "What tools or promo codes were mentioned in my job reels?").'
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);

  // Quick Transcribe State
  const [inputUrl, setInputUrl] = useState('');
  const [transcribing, setTranscribing] = useState(false);
  const [transcribeMsg, setTranscribeMsg] = useState(null);

  // Settings State
  const [config, setConfig] = useState({});
  const [groqKey, setGroqKey] = useState('');
  const [openaiKey, setOpenaiKey] = useState('');
  const [pageToken, setPageToken] = useState('');
  const [verifyToken, setVerifyToken] = useState('instam_secret_verify_token_2026');
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Utility state
  const [copied, setCopied] = useState(false);

  // 1. Initialize User Session
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenFromUrl = urlParams.get('token');
    const storedToken = tokenFromUrl || localStorage.getItem('reelmind_token');

    fetch(`${API_BASE}/auth/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: storedToken })
    })
      .then(res => res.json())
      .then(data => {
        setSession(data);
        if (data.auth_token) {
          localStorage.setItem('reelmind_token', data.auth_token);
        }
      })
      .catch(err => console.error('Session error:', err));

    fetchCategories();
    fetchConfig();
  }, []);

  // 2. Fetch Reels when Session, Category or Search Query Changes
  useEffect(() => {
    if (!session) return;
    fetchReels();
    const interval = setInterval(fetchReels, 4000); // Live poll for new DM reels
    return () => clearInterval(interval);
  }, [session, selectedCategory, searchQuery]);

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

  const fetchReels = async () => {
    try {
      const token = session?.auth_token || localStorage.getItem('reelmind_token') || '';
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

  const fetchConfig = async () => {
    try {
      const res = await fetch(`${API_BASE}/config`);
      if (res.ok) {
        const data = await res.json();
        setConfig(data);
        if (data.verify_token) setVerifyToken(data.verify_token);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Generate Instagram Linking Code
  const handleGeneratePairingCode = async () => {
    setPairingLoading(true);
    try {
      const token = session?.auth_token || '';
      const res = await fetch(`${API_BASE}/auth/generate-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      });
      if (res.ok) {
        const data = await res.json();
        setPairingCode(data.code);
        setShowPairModal(true);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setPairingLoading(false);
    }
  };

  // "Ask Your Reels" AI Chat Handler
  const handleAskAI = async (e) => {
    e?.preventDefault();
    if (!chatQuestion.trim() || chatLoading) return;

    const userText = chatQuestion.trim();
    setChatQuestion('');
    const newHistory = [...chatMessages, { role: 'user', content: userText }];
    setChatMessages(newHistory);
    setChatLoading(true);

    try {
      const token = session?.auth_token || '';
      const res = await fetch(`${API_BASE}/chat/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': token
        },
        body: JSON.stringify({ question: userText })
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages([
          ...newHistory,
          {
            role: 'assistant',
            content: data.answer,
            citations: data.citations || []
          }
        ]);
      } else {
        setChatMessages([
          ...newHistory,
          { role: 'assistant', content: '❌ Failed to get answer. Please check if your GROQ_API_KEY is configured in Settings.' }
        ]);
      }
    } catch (err) {
      setChatMessages([
        ...newHistory,
        { role: 'assistant', content: '❌ Connection error while querying AI.' }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Quick Transcribe URL
  const handleTranscribeUrl = async (e) => {
    e.preventDefault();
    if (!inputUrl.trim()) return;

    setTranscribing(true);
    setTranscribeMsg(null);
    try {
      const token = session?.auth_token || '';
      const res = await fetch(`${API_BASE}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': token
        },
        body: JSON.stringify({ url: inputUrl })
      });
      const data = await res.json();
      if (res.ok) {
        setTranscribeMsg({ success: true, text: 'Processing started! It will appear in your Vault momentarily.' });
        setInputUrl('');
        setTimeout(() => {
          fetchReels();
          setActiveTab('vault');
        }, 1500);
      } else {
        setTranscribeMsg({ success: false, text: data.detail || 'Failed to submit URL' });
      }
    } catch (err) {
      setTranscribeMsg({ success: false, text: 'Failed to connect to backend server' });
    } finally {
      setTranscribing(false);
    }
  };

  // Save Config
  const handleSaveConfig = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        meta_verify_token: verifyToken,
        ...(groqKey && { groq_api_key: groqKey }),
        ...(openaiKey && { openai_api_key: openaiKey }),
        ...(pageToken && { instagram_page_access_token: pageToken }),
      };
      const res = await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
        fetchConfig();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Reel Detail Modal
  const openReelDetail = async (reel) => {
    const reelId = reel?.id || reel?.reel_id;
    if (!reelId) return;
    try {
      const res = await fetch(`${API_BASE}/reels/${reelId}`);
      if (res.ok) {
        const detail = await res.json();
        setSelectedReel(detail);
      } else {
        setSelectedReel(reel);
      }
    } catch (e) {
      setSelectedReel(reel);
    }
  };

  // Delete Reel
  const handleDeleteReel = async (id, e) => {
    e?.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/reels/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setReels(prev => prev.filter(r => r.id !== id));
        if (selectedReel?.id === id) setSelectedReel(null);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Copy helper
  const copyText = (txt) => {
    navigator.clipboard.writeText(txt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Download SRT
  const downloadSRT = (reel) => {
    const transcript = reel?.transcript;
    if (!transcript) return;
    let srt = "";
    const segments = transcript.segments || [];
    if (segments.length > 0) {
      segments.forEach((seg, idx) => {
        const formatTime = (sec) => {
          const date = new Date(0);
          date.setMilliseconds(sec * 1000);
          return date.toISOString().substr(11, 12).replace('.', ',');
        };
        srt += `${idx + 1}\n`;
        srt += `${formatTime(seg.start)} --> ${formatTime(seg.end)}\n`;
        srt += `${seg.text.trim()}\n\n`;
      });
    } else {
      srt = `1\n00:00:00,000 --> 00:00:10,000\n${transcript.full_text}\n`;
    }
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
      {/* TOP NAVIGATION BAR */}
      {/* ======================================================== */}
      <header style={{
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(7, 9, 14, 0.85)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 50
      }}>
        <div className="header-container" style={{ maxWidth: '1240px', margin: '0 auto', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          
          <div className="header-top-row">
            {/* Logo & Slogan */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => setActiveTab('vault')}>
              <div style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(99, 102, 241, 0.4)',
                flexShrink: 0
              }}>
                <Sparkles size={20} color="#ffffff" />
              </div>
              <div>
                <div style={{ fontSize: '1.15rem', fontWeight: '800', letterSpacing: '-0.02em', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  ReelDex
                  <span style={{ fontSize: '0.65rem', fontWeight: '700', padding: '1px 6px', borderRadius: '4px', background: 'rgba(99, 102, 241, 0.2)', color: '#818cf8' }}>
                    REELDEX.IO
                  </span>
                </div>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Second Brain for Instagram Reels
                </p>
              </div>
            </div>

            {/* Instagram Pairing Action on Mobile */}
            <div className="header-action" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {session?.is_instagram_linked ? (
                <div className="header-user-badge" style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-full)',
                  background: 'rgba(16, 185, 129, 0.12)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  fontSize: '0.78rem',
                  color: '#10b981',
                  fontWeight: '600',
                  whiteSpace: 'nowrap'
                }}>
                  <InstagramIcon size={14} />
                  <span>@{session.instagram_username || 'Linked'}</span>
                </div>
              ) : (
                <button
                  onClick={handleGeneratePairingCode}
                  className="btn-primary"
                  style={{ fontSize: '0.8rem', padding: '7px 12px', whiteSpace: 'nowrap' }}
                >
                  <InstagramIcon size={14} /> Connect
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="nav-bar no-scrollbar" style={{ display: 'flex', gap: '6px', background: 'rgba(255, 255, 255, 0.03)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-subtle)', overflowX: 'auto' }}>
            <button
              onClick={() => setActiveTab('vault')}
              className={`pill-button ${activeTab === 'vault' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <FolderOpen size={15} /> Vault ({reels.length})
            </button>
            <button
              onClick={() => setActiveTab('chat')}
              className={`pill-button ${activeTab === 'chat' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Bot size={15} /> Ask AI
            </button>
            <button
              onClick={() => setActiveTab('transcribe')}
              className={`pill-button ${activeTab === 'transcribe' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <PlusCircle size={15} /> Transcribe URL
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`pill-button ${activeTab === 'settings' ? 'active' : ''}`}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Settings size={15} /> Settings
            </button>
          </nav>
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN CONTENT CONTAINER */}
      {/* ======================================================== */}
      <main className="main-content" style={{ maxWidth: '1240px', width: '100%', margin: '0 auto', padding: '24px 16px', flex: 1 }}>

        {/* TAB 1: KNOWLEDGE VAULT (Semantic Search & Collections) */}
        {activeTab === 'vault' && (
          <div>
            {/* Hero Search Omnibar */}
            <div className="glass-panel" style={{ padding: '20px', marginBottom: '20px', position: 'relative', overflow: 'hidden' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ position: 'relative', width: '100%' }}>
                  <Search size={18} color="var(--text-subtle)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
                  <input
                    type="text"
                    placeholder="Search transcripts, tools, summaries (e.g. 'job referrals')..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="custom-input"
                    style={{
                      paddingLeft: '42px',
                      fontSize: '0.92rem',
                      paddingTop: '12px',
                      paddingBottom: '12px',
                      borderRadius: '12px'
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      style={{ position: 'absolute', right: '14px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-subtle)', cursor: 'pointer' }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Category Filter Pills */}
                <div className="no-scrollbar" style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`pill-button ${selectedCategory === cat ? 'active' : ''}`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Results Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <h2 style={{ fontSize: '1.15rem', fontWeight: '700' }}>
                  {selectedCategory === 'All' ? 'All Saved Knowledge' : selectedCategory}
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-subtle)', background: 'rgba(255,255,255,0.05)', padding: '2px 7px', borderRadius: '6px' }}>
                  {reels.length} {reels.length === 1 ? 'Reel' : 'Reels'}
                </span>
              </div>

              {searchQuery && (
                <span style={{ fontSize: '0.78rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Sparkles size={13} /> Semantic Match
                </span>
              )}
            </div>

            {/* Reel Cards Grid */}
            {reels.length === 0 ? (
              <div className="glass-panel" style={{ padding: '48px 18px', textAlign: 'center' }}>
                <InstagramIcon size={38} color="#6366f1" style={{ margin: '0 auto 14px', opacity: 0.85 }} />
                <h3 style={{ fontSize: '1.15rem', fontWeight: '700', marginBottom: '8px' }}>Your Vault is Empty</h3>
                <p style={{ color: 'var(--text-muted)', maxWidth: '440px', margin: '0 auto 20px', fontSize: '0.88rem', lineHeight: '1.6' }}>
                  Send any Instagram Reel in DM to your connected bot, or paste a link in the Transcribe tab to automatically populate your knowledge base!
                </p>
                <div className="empty-vault-actions" style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                  <button onClick={handleGeneratePairingCode} className="btn-primary" style={{ padding: '10px 18px' }}>
                    <InstagramIcon size={15} /> Link Instagram Account
                  </button>
                  <button onClick={() => setActiveTab('transcribe')} className="btn-secondary" style={{ padding: '10px 18px' }}>
                    <PlusCircle size={15} /> Transcribe a Link
                  </button>
                </div>
              </div>
            ) : (
              <div className="reels-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '18px' }}>
                {reels.map((reel) => (
                  <div
                    key={reel.id}
                    className="glass-panel glass-panel-hover"
                    style={{ padding: '22px', cursor: 'pointer', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}
                    onClick={() => openReelDetail(reel)}
                  >
                    <div>
                      {/* Top Header: Category & Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                          padding: '3px 9px',
                          borderRadius: '6px',
                          background: 'rgba(99, 102, 241, 0.15)',
                          color: '#a5b4fc',
                          border: '1px solid rgba(99, 102, 241, 0.25)'
                        }}>
                          {reel.category || 'General'}
                        </span>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-subtle)' }}>
                            {new Date(reel.created_at).toLocaleDateString()}
                          </span>
                          <button
                            onClick={(e) => handleDeleteReel(reel.id, e)}
                            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: '4px' }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Title & Creator */}
                      <h3 style={{ fontSize: '1.05rem', fontWeight: '700', marginBottom: '6px', color: '#ffffff', lineHeight: '1.4' }}>
                        {reel.title || `Reel by ${reel.author || 'Creator'}`}
                      </h3>
                      
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-subtle)', marginBottom: '12px' }}>
                        by @{reel.author || reel.sender_username || 'creator'} {reel.duration ? `• ${Math.round(reel.duration)}s` : ''}
                      </div>

                      {/* AI Summary Preview */}
                      <p style={{ fontSize: '0.88rem', color: '#cbd5e1', lineHeight: '1.6', marginBottom: '14px' }}>
                        {reel.summary || reel.preview_text || 'Transcribing in progress...'}
                      </p>

                      {/* Extracted Action Items Pill */}
                      {reel.action_items?.length > 0 && (
                        <div style={{
                          marginBottom: '14px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'rgba(168, 85, 247, 0.08)',
                          border: '1px solid rgba(168, 85, 247, 0.2)',
                          fontSize: '0.78rem',
                          color: '#e9d5ff'
                        }}>
                          <strong>🛠️ Action Item:</strong> {reel.action_items[0]?.text || reel.action_items[0]}
                        </div>
                      )}

                      {/* Tags */}
                      {reel.tags?.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' }}>
                          {reel.tags.slice(0, 3).map((tag, idx) => (
                            <span key={idx} className="tag-badge">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Bottom Status */}
                    <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#818cf8' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Clock size={13} /> View Full Transcript
                      </span>
                      <ChevronRight size={15} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: "ASK YOUR REELS" AI CHAT (RAG) */}
        {activeTab === 'chat' && (
          <div style={{ maxWidth: '840px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '28px', minHeight: '620px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '16px' }}>
                  <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'linear-gradient(135deg, #a855f7, #6366f1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Bot size={20} color="#fff" />
                  </div>
                  <div>
                    <h2 style={{ fontSize: '1.15rem', fontWeight: '700' }}>Ask Your Saved Reels</h2>
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Query your entire collection using Groq LLaMA 3.3 70B
                    </p>
                  </div>
                </div>

                {/* Messages Stream */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxHeight: '420px', overflowY: 'auto', paddingRight: '6px', marginBottom: '20px' }}>
                  {chatMessages.map((msg, i) => (
                    <div
                      key={i}
                      style={{
                        alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        maxWidth: '85%',
                        padding: '14px 18px',
                        borderRadius: '14px',
                        background: msg.role === 'user' ? '#4f46e5' : 'rgba(255, 255, 255, 0.04)',
                        border: msg.role === 'user' ? 'none' : '1px solid var(--border-subtle)',
                        fontSize: '0.92rem',
                        lineHeight: '1.6',
                        color: msg.role === 'user' ? '#ffffff' : '#e2e8f0'
                      }}
                    >
                      <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>

                      {/* Citations Box */}
                      {msg.citations?.length > 0 && (
                        <div style={{ marginTop: '12px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '8px' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#a5b4fc', textTransform: 'uppercase' }}>
                            Referenced Reels:
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                            {msg.citations.map((c, idx) => (
                              <div
                                key={idx}
                                onClick={() => openReelDetail(c)}
                                style={{ fontSize: '0.78rem', color: '#c084fc', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                              >
                                🎬 {c.title} by @{c.author}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {chatLoading && (
                    <div style={{ alignSelf: 'flex-start', padding: '12px 18px', borderRadius: '14px', background: 'rgba(255, 255, 255, 0.04)', border: '1px solid var(--border-subtle)', fontSize: '0.88rem', color: '#a5b4fc', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Sparkles size={16} className="animate-spin" /> Analyzing your saved reels library...
                    </div>
                  )}
                </div>
              </div>

                {/* Suggested Prompts */}
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
                  {[
                    "What tools or promo codes were mentioned?",
                    "Summarize all job advice I saved",
                    "List all productivity rules"
                  ].map((prompt, idx) => (
                    <button
                      key={idx}
                      onClick={() => setChatQuestion(prompt)}
                      style={{ fontSize: '0.75rem', padding: '4px 10px', borderRadius: 'var(--radius-full)', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      ✨ {prompt}
                    </button>
                  ))}
                </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleAskAI} style={{ display: 'flex', gap: '10px' }}>
                <input
                  type="text"
                  placeholder="Ask a question about any reel you have saved..."
                  value={chatQuestion}
                  onChange={(e) => setChatQuestion(e.target.value)}
                  className="custom-input"
                  style={{ borderRadius: '12px' }}
                />
                <button type="submit" disabled={chatLoading} className="btn-primary" style={{ padding: '0 22px' }}>
                  Ask AI
                </button>
              </form>
            </div>
          </div>
        )}

        {/* TAB 3: QUICK TRANSCRIBE URL */}
        {activeTab === 'transcribe' && (
          <div style={{ maxWidth: '640px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '32px' }}>
              <h2 style={{ fontSize: '1.3rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <PlusCircle size={22} color="#6366f1" /> Transcribe Direct Instagram Reel
              </h2>
              <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                Paste any public Instagram reel URL. Our engine will extract the pure audio stream, transcribe speech in ~1 second, and extract structured AI insights.
              </p>

              <form onSubmit={handleTranscribeUrl}>
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    INSTAGRAM REEL URL
                  </label>
                  <input
                    type="text"
                    placeholder="https://www.instagram.com/reel/..."
                    value={inputUrl}
                    onChange={(e) => setInputUrl(e.target.value)}
                    className="custom-input"
                    style={{ fontSize: '0.95rem', padding: '12px 14px' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={transcribing}
                  className="btn-primary"
                  style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.95rem' }}
                >
                  {transcribing ? 'Extracting & Transcribing Audio...' : '🚀 Transcribe & Save to Vault'}
                </button>
              </form>

              {transcribeMsg && (
                <div style={{
                  marginTop: '18px',
                  padding: '12px 16px',
                  borderRadius: '10px',
                  background: transcribeMsg.success ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                  border: `1px solid ${transcribeMsg.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(244, 63, 94, 0.3)'}`,
                  color: transcribeMsg.success ? '#10b981' : '#f43f5e',
                  fontSize: '0.88rem'
                }}>
                  {transcribeMsg.text}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 4: SETTINGS & WEBHOOK */}
        {activeTab === 'settings' && (
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div className="glass-panel" style={{ padding: '32px' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '700', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings size={20} color="#818cf8" /> API & Instagram Configuration
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
                Manage your Groq AI Whisper keys and Meta Instagram Webhook endpoints.
              </p>

              <form onSubmit={handleSaveConfig}>
                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    GROQ API KEY (Free Whisper + LLaMA 3.3 70B)
                  </label>
                  <input
                    type="password"
                    placeholder="gsk_..."
                    value={groqKey}
                    onChange={(e) => setGroqKey(e.target.value)}
                    className="custom-input"
                  />
                </div>

                <div style={{ marginBottom: '18px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    INSTAGRAM PAGE ACCESS TOKEN (For Auto-Replying in DM)
                  </label>
                  <input
                    type="password"
                    placeholder="IGAA... or EAAB..."
                    value={pageToken}
                    onChange={(e) => setPageToken(e.target.value)}
                    className="custom-input"
                  />
                </div>

                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '600', color: 'var(--text-muted)', marginBottom: '6px' }}>
                    PUBLIC WEBHOOK CALLBACK URL
                  </label>
                  <input
                    type="text"
                    readOnly
                    value="https://birthday-leone-hair-spoke.trycloudflare.com/api/webhook/instagram"
                    className="custom-input"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.82rem', color: '#a5b4fc' }}
                  />
                </div>

                <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  {saveSuccess ? '✅ Configuration Saved!' : 'Save Settings'}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ======================================================== */}
      {/* INSTAGRAM PAIRING MODAL */}
      {/* ======================================================== */}
      {showPairModal && (
        <div className="modal-overlay" onClick={() => setShowPairModal(false)}>
          <div className="glass-panel" style={{ maxWidth: '520px', width: '100%', padding: '32px' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: 'linear-gradient(135deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <InstagramIcon size={20} color="#fff" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Connect Your Instagram</h3>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Link your account in 10 seconds</p>
                </div>
              </div>
              <button onClick={() => setShowPairModal(false)} className="btn-secondary" style={{ padding: '6px 10px' }}>✕</button>
            </div>

            <div style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid var(--border-subtle)', borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '20px' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--text-subtle)', textTransform: 'uppercase' }}>
                Your Unique Linking Code
              </span>
              <div style={{ fontSize: '2rem', fontWeight: '800', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', color: '#a5b4fc', margin: '8px 0' }}>
                {pairingCode || 'MIND-849201'}
              </div>
              <button onClick={() => copyText(pairingCode)} className="btn-secondary" style={{ fontSize: '0.8rem', padding: '6px 12px' }}>
                {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />} Copy Code
              </button>
            </div>

            <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: '1.6', marginBottom: '24px' }}>
              <strong>How it works:</strong>
              <ol style={{ paddingLeft: '20px', marginTop: '6px' }}>
                <li>Open Instagram and search for <strong>@reeldex.io</strong> (or click below).</li>
                <li>Send a Direct Message containing the code: <code style={{ color: '#818cf8' }}>{pairingCode}</code>.</li>
                <li>The bot will reply with confirmation and connect your personal knowledge library!</li>
              </ol>
            </div>

            <a
              href="https://ig.me/m/reeldex.io"
              target="_blank"
              rel="noreferrer"
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center' }}
            >
              Open Instagram & Send Code <ExternalLink size={16} />
            </a>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* REEL DETAIL & FULL TRANSCRIPT MODAL */}
      {/* ======================================================== */}
      {selectedReel && (
        <div className="modal-overlay" onClick={() => setSelectedReel(null)}>
          <div className="glass-panel" style={{ maxWidth: '780px', width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: '32px' }} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div>
                <span style={{
                  fontSize: '0.72rem',
                  fontWeight: '700',
                  textTransform: 'uppercase',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  background: 'rgba(99, 102, 241, 0.15)',
                  color: '#a5b4fc',
                  border: '1px solid rgba(99, 102, 241, 0.25)'
                }}>
                  {selectedReel.category || 'General'}
                </span>
                <h3 style={{ fontSize: '1.3rem', fontWeight: '700', marginTop: '8px', color: '#ffffff' }}>
                  {selectedReel.title || `Reel by @${selectedReel.author || 'Creator'}`}
                </h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  by @{selectedReel.author || selectedReel.sender_username} {selectedReel.duration ? `• ${Math.round(selectedReel.duration)}s` : ''}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => copyText(selectedReel.transcript?.full_text || selectedReel.preview_text || '')}
                  className="btn-secondary"
                  title="Copy Full Text"
                >
                  {copied ? <Check size={16} color="#10b981" /> : <Copy size={16} />}
                </button>
                {selectedReel.transcript && (
                  <button
                    onClick={() => downloadSRT(selectedReel)}
                    className="btn-secondary"
                    title="Download SRT Subtitles"
                  >
                    <Download size={16} /> .SRT
                  </button>
                )}
                <button onClick={() => setSelectedReel(null)} className="btn-secondary">✕</button>
              </div>
            </div>

            {/* AI Summary Box */}
            {selectedReel.transcript?.summary && (
              <div style={{
                padding: '18px',
                borderRadius: '12px',
                background: 'rgba(99, 102, 241, 0.08)',
                border: '1px solid rgba(99, 102, 241, 0.2)',
                marginBottom: '20px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: '700', color: '#818cf8', marginBottom: '8px' }}>
                  <Sparkles size={16} /> AI SUMMARY & KEY TAKEAWAYS
                </div>
                <p style={{ fontSize: '0.92rem', color: '#e2e8f0', lineHeight: '1.6', marginBottom: selectedReel.transcript.key_points?.length ? '12px' : '0' }}>
                  {selectedReel.transcript.summary}
                </p>

                {selectedReel.transcript.key_points?.length > 0 && (
                  <ul style={{ paddingLeft: '20px', fontSize: '0.88rem', color: '#cbd5e1', lineHeight: '1.6' }}>
                    {selectedReel.transcript.key_points.map((pt, i) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{pt}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Extracted Actions & Tools Box */}
            {selectedReel.action_items?.length > 0 && (
              <div style={{
                padding: '14px 18px',
                borderRadius: '12px',
                background: 'rgba(168, 85, 247, 0.08)',
                border: '1px solid rgba(168, 85, 247, 0.2)',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '0.82rem', fontWeight: '700', color: '#d8b4fe', marginBottom: '6px' }}>
                  🛠️ EXTRACTED TOOLS, CODES & ACTION ITEMS
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {selectedReel.action_items.map((act, i) => (
                    <div key={i} style={{ fontSize: '0.85rem', color: '#f3e8ff' }}>
                      • {typeof act === 'string' ? act : act.text}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Full Transcript Box */}
            <div style={{ marginBottom: '20px' }}>
              <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>
                FULL WORD-FOR-WORD TRANSCRIPTION
              </h4>
              <div style={{
                maxHeight: '260px',
                overflowY: 'auto',
                padding: '16px',
                borderRadius: '10px',
                background: 'rgba(10, 14, 23, 0.8)',
                border: '1px solid var(--border-subtle)',
                fontSize: '0.92rem',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap'
              }}>
                {selectedReel.transcript?.full_text || selectedReel.preview_text || 'Transcription processing in background...'}
              </div>
            </div>

            {/* Interactive Timestamps */}
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
                <div style={{ marginBottom: '20px' }}>
                  <h4 style={{ fontSize: '0.85rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>
                    TIMESTAMPED SEGMENTS ({segs.length})
                  </h4>
                  <div style={{ maxHeight: '180px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {segs.map((seg, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          gap: '12px',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          background: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid rgba(255, 255, 255, 0.04)',
                          fontSize: '0.85rem'
                        }}
                      >
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#a855f7', minWidth: '70px' }}>
                          {Math.floor(seg.start || 0)}s - {Math.floor(seg.end || 0)}s
                        </span>
                        <span style={{ color: '#e2e8f0' }}>{seg.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Footer */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-subtle)', paddingTop: '18px' }}>
              <a
                href={selectedReel.reel_url}
                target="_blank"
                rel="noreferrer"
                style={{ color: '#818cf8', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px', textDecoration: 'none' }}
              >
                Open Reel on Instagram <ExternalLink size={14} />
              </a>
              <button onClick={() => setSelectedReel(null)} className="btn-primary" style={{ padding: '8px 24px' }}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
