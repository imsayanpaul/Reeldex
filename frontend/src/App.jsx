import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
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
  Folder,
  FolderPlus,
  Languages,
  Globe,
  Plus,
  X,
  Play,
  Zap,
  Bookmark,
  Layers,
  Tag,
  Share2,
  Menu,
  ChevronRight,
  SlidersHorizontal,
  Compass,
  CheckCircle2
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
  if (typeof item === 'string') {
    const s = item.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        return formatActionItem(parsed);
      } catch (e) {
        return '';
      }
    }
    return s;
  }
  if (typeof item === 'object') {
    const text = item.text || item.name || item.value || item.title || item.action || item.item || item.tool || item.code || '';
    if (!text || typeof text !== 'string' || !text.trim()) {
      return '';
    }
    return text.trim();
  }
  return String(item).trim();
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
  // Navigation & View State
  const [activeTab, setActiveTab] = useState('vault'); // 'vault' | 'chat'
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // User & Pairing State
  const initialToken = getInitialToken();
  const [session, setSession] = useState({ auth_token: initialToken, display_name: 'ReelDex Explorer' });
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);
  const [pairingLoading, setPairingLoading] = useState(false);

  // Vault, Collections & Search State
  const [reels, setReels] = useState([]);
  const [categories, setCategories] = useState(['All']);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReel, setSelectedReel] = useState(null);

  // Collection Creator & Popover
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [openCollectionPickerId, setOpenCollectionPickerId] = useState(null);

  // On-Demand Translation State
  const [translating, setTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);

  // Ask AI Chat State
  const [chatQuestion, setChatQuestion] = useState('');
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content: '👋 Hi! I am your **ReelDex AI Copilot**. Ask me anything across your saved Instagram Reels — like *"List all AI tools mentioned"*, *"Summarize workout routines"*, or *"Find marketing advice"*.'
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
    fetchCollections(currentToken);
    fetchReels(currentToken);
  }, []);

  // 2. Fetch Reels when Category, Collection, or Search Query Changes
  useEffect(() => {
    fetchReels();
    const interval = setInterval(fetchReels, 4000);
    return () => clearInterval(interval);
  }, [session?.auth_token, selectedCategory, selectedCollection, searchQuery]);

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

  const fetchCollections = async (overrideToken) => {
    try {
      const token = overrideToken !== undefined ? overrideToken : (session?.auth_token || getSafeStorage('reelmind_token') || '');
      const res = await fetch(`${API_BASE}/collections?token=${token}`);
      if (res.ok) {
        const data = await res.json();
        setCollections(data || []);
      }
    } catch (e) {
      console.error('Error fetching collections:', e);
    }
  };

  const fetchReels = async (overrideToken) => {
    try {
      const token = overrideToken !== undefined ? overrideToken : (session?.auth_token || getSafeStorage('reelmind_token') || '');
      let url = `${API_BASE}/reels?token=${token}&category=${encodeURIComponent(selectedCategory)}`;
      if (selectedCollection?.id) {
        url += `&collection_id=${selectedCollection.id}`;
      }
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
      const res = await fetch(`${API_BASE}/auth/generate-code`, {
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

  const handleCreateCollection = async (e) => {
    if (e) e.preventDefault();
    if (!newCollectionName.trim()) return;
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/collections?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCollectionName.trim() })
      });
      if (res.ok) {
        const newCol = await res.json();
        setNewCollectionName('');
        setShowCreateCollectionModal(false);
        fetchCollections(token);
        setSelectedCollection(newCol);
      }
    } catch (err) {
      console.error('Error creating collection:', err);
    }
  };

  const handleDeleteCollection = async (collectionId, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Delete this collection? (Reels inside will remain in your vault)')) return;
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/collections/${collectionId}?token=${token}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedCollection?.id === collectionId) setSelectedCollection(null);
        fetchCollections(token);
        fetchReels();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleAssignCollection = async (reelId, collectionId, e) => {
    if (e) e.stopPropagation();
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/reels/${reelId}/collection?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_id: collectionId })
      });
      if (res.ok) {
        const data = await res.json();
        setReels(prev => prev.map(r => r.id === reelId ? { 
          ...r, 
          collection_id: data.collection_id, 
          collection_name: data.collection_name
        } : r));
        if (selectedReel?.id === reelId) {
          setSelectedReel(prev => ({ 
            ...prev, 
            collection_id: data.collection_id, 
            collection_name: data.collection_name
          }));
        }
        setOpenCollectionPickerId(null);
        fetchCollections(token);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTranslateReel = async (reelId) => {
    if (translating) return;
    setTranslating(true);
    try {
      const res = await fetch(`${API_BASE}/reels/${reelId}/translate`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSelectedReel(prev => ({
            ...prev,
            transcript: {
              ...prev.transcript,
              translated_text: data.translated_text,
              translated_summary: data.translated_summary
            }
          }));
          setShowTranslated(true);
        }
      }
    } catch (err) {
      console.error('Translation error:', err);
    } finally {
      setTranslating(false);
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

    const userMsg = { role: 'user', content: chatQuestion.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatQuestion('');
    setChatLoading(true);

    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: userMsg.content, token })
      });
      const data = await res.json();
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer || 'No answer generated.',
        citations: data.citations || []
      }]);
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: '⚠️ Sorry, there was an error analyzing your library. Please try again.'
      }]);
    } finally {
      setChatLoading(false);
    }
  };

  const copyText = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSRT = (reel) => {
    if (!reel.transcript?.full_text) return;
    const srtContent = `1\n00:00:00,000 --> 00:00:10,000\n${reel.transcript.full_text}\n`;
    const blob = new Blob([srtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${(reel.title || 'reel').replace(/[^a-z0-9]/gi, '_').toLowerCase()}.srt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-studio-layout">
      {/* ======================================================== */}
      {/* LEFT WORKSPACE SIDEBAR */}
      {/* ======================================================== */}
      <aside className="app-sidebar">
        <div>
          {/* Brand Logo */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px 18px', borderBottom: '1px solid var(--border-light)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #ff5722, #f43f5e)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(255, 87, 34, 0.3)'
              }}>
                <Zap size={18} color="#ffffff" />
              </div>
              <div>
                <span style={{ fontSize: '1.05rem', fontWeight: '900', color: 'var(--text-heading)', letterSpacing: '-0.03em' }}>
                  ReelDex
                </span>
                <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#ff5722', background: 'rgba(255, 87, 34, 0.1)', padding: '1px 5px', borderRadius: '4px', marginLeft: '6px' }}>
                  v2.0
                </span>
              </div>
            </div>
          </div>

          {/* Core Navigation */}
          <div style={{ marginTop: '16px' }}>
            <button
              onClick={() => { setActiveTab('vault'); setSelectedCollection(null); setSelectedCategory('All'); }}
              className={`nav-item-button ${activeTab === 'vault' && selectedCollection === null && selectedCategory === 'All' ? 'active' : ''}`}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Layers size={16} className="nav-icon" color="#64748b" />
                <span>All Vault Reels</span>
              </span>
              <span className="nav-badge-count">{reels.length}</span>
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`nav-item-button ${activeTab === 'chat' ? 'active' : ''}`}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bot size={16} className="nav-icon" color="#64748b" />
                <span>Ask AI Copilot</span>
              </span>
              <span style={{ fontSize: '0.68rem', fontWeight: '800', background: 'linear-gradient(135deg, #ff5722, #f43f5e)', color: '#fff', padding: '1px 6px', borderRadius: '4px' }}>
                AI
              </span>
            </button>
          </div>

          {/* Collections Section */}
          <div className="sidebar-scrollable">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 8px 6px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Collections
              </span>
              <button
                onClick={() => setShowCreateCollectionModal(true)}
                style={{ background: 'none', border: 'none', color: '#ff5722', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px', fontSize: '0.74rem', fontWeight: '700' }}
              >
                <Plus size={13} /> New
              </button>
            </div>

            {collections.length === 0 ? (
              <div style={{ padding: '8px', fontSize: '0.76rem', color: 'var(--text-subtle)' }}>
                No custom folders yet
              </div>
            ) : (
              collections.map((col) => (
                <button
                  key={col.id}
                  onClick={() => { setActiveTab('vault'); setSelectedCollection(col); }}
                  className={`nav-item-button ${activeTab === 'vault' && selectedCollection?.id === col.id ? 'active' : ''}`}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <Folder size={15} className="nav-icon" color="#64748b" />
                    <span>{col.name}</span>
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span className="nav-badge-count">{col.count}</span>
                    {selectedCollection?.id === col.id && (
                      <span
                        onClick={(e) => handleDeleteCollection(col.id, e)}
                        style={{ color: '#94a3b8', cursor: 'pointer' }}
                        title="Delete collection"
                      >
                        <X size={12} />
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}

            {/* Knowledge Categories */}
            <div style={{ padding: '16px 8px 6px', marginTop: '6px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Categories
              </span>
            </div>

            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setActiveTab('vault'); setSelectedCategory(cat); setSelectedCollection(null); }}
                className={`nav-item-button ${activeTab === 'vault' && selectedCategory === cat && !selectedCollection ? 'active' : ''}`}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Tag size={14} className="nav-icon" color="#94a3b8" />
                  <span>{cat}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MAIN WORKSPACE CANVAS */}
      {/* ======================================================== */}
      <main className="app-main-canvas">
        
        {/* Top Omni-Header Bar */}
        <header className="app-top-header">
          {/* Search Input Bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, maxWidth: '640px' }}>
            <div style={{
              position: 'relative',
              width: '100%',
              display: 'flex',
              alignItems: 'center'
            }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px' }} />
              <input
                type="text"
                placeholder="Search transcripts, extracted tools, creators, or topics..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 36px 9px 36px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-light)',
                  background: '#f8fafc',
                  fontSize: '0.86rem',
                  outline: 'none',
                  color: 'var(--text-heading)',
                  transition: 'all 0.15s ease'
                }}
              />
              {searchQuery ? (
                <button
                  onClick={() => setSearchQuery('')}
                  style={{ position: 'absolute', right: '10px', background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              ) : (
                <span style={{
                  position: 'absolute',
                  right: '10px',
                  fontSize: '0.68rem',
                  fontWeight: '700',
                  color: '#94a3b8',
                  background: '#ffffff',
                  border: '1px solid var(--border-light)',
                  padding: '2px 5px',
                  borderRadius: '4px'
                }}>
                  ⌘K
                </span>
              )}
            </div>
          </div>

          {/* Header Action Buttons & User Profile */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              onClick={handleGeneratePairingCode}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '5px 12px',
                borderRadius: 'var(--radius-full)',
                background: '#ffffff',
                border: '1px solid var(--border-light)',
                cursor: 'pointer',
                boxShadow: 'var(--shadow-xs)',
                transition: 'all 0.15s ease'
              }}
              title="Click to manage Instagram connection"
            >
              <div style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                background: session.is_instagram_linked ? 'linear-gradient(135deg, #ff5722, #f43f5e)' : '#f1f5f9',
                color: session.is_instagram_linked ? '#ffffff' : '#64748b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.72rem',
                fontWeight: '800'
              }}>
                {session.instagram_username ? session.instagram_username.slice(0, 1).toUpperCase() : 'U'}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.8rem', fontWeight: '700', color: 'var(--text-heading)', lineHeight: '1.2' }}>
                  {session.instagram_username || session.display_name || 'User #3832'}
                </span>
                <span style={{ fontSize: '0.66rem', color: session.is_instagram_linked ? '#10b981' : '#f59e0b', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: session.is_instagram_linked ? '#10b981' : '#f59e0b' }} />
                  {session.is_instagram_linked ? 'Synced' : 'Link IG'}
                </span>
              </div>
            </div>

            <button onClick={() => setActiveTab(activeTab === 'vault' ? 'chat' : 'vault')} className="btn-coral">
              {activeTab === 'vault' ? <><Sparkles size={14} /> Ask AI</> : <><Layers size={14} /> Vault</>}
            </button>
          </div>
        </header>

        {/* Content Container */}
        <div className="content-container">

          {/* TAB 1: REELS VAULT */}
          {activeTab === 'vault' && (
            <div>
              {/* Studio Canvas Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '14px' }}>
                <div>
                  <h1 style={{ fontSize: '1.65rem', fontWeight: '900', color: 'var(--text-heading)', letterSpacing: '-0.03em' }}>
                    {selectedCollection ? selectedCollection.name : (selectedCategory === 'All' ? 'All Saved Knowledge' : selectedCategory)}
                  </h1>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '3px' }}>
                    {reels.length} {reels.length === 1 ? 'Reel' : 'Reels'} · AI Transcribed & Deduplicated with 0-Token Engine
                  </p>
                </div>
              </div>

              {/* Reels Grid / Empty State */}
              {reels.length === 0 ? (
                <div className="studio-card" style={{ padding: '48px 24px', textAlign: 'center', maxWidth: '580px', margin: '40px auto' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: '14px',
                    background: 'var(--accent-primary-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 14px'
                  }}>
                    <Bookmark size={22} color="#ff5722" />
                  </div>
                  
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-heading)', marginBottom: '6px' }}>
                    {selectedCollection ? `No reels in "${selectedCollection.name}" yet` : 'Your Knowledge Vault is Ready'}
                  </h3>
                  <p style={{ color: 'var(--text-body)', fontSize: '0.86rem', lineHeight: '1.6', marginBottom: '22px', maxWidth: '420px', margin: '0 auto 22px' }}>
                    {selectedCollection 
                      ? 'Assign reels to this collection from any reel card using the folder icon!' 
                      : (session.is_instagram_linked 
                          ? 'Send any Instagram Reel in DM to @reeldex.io. Our AI engine transcribes speech, extracts tools, and saves it here automatically!'
                          : 'Link your Instagram account to automatically sync and transcribe reels you share in Direct Messages!')}
                  </p>

                  {selectedCollection ? (
                    <button
                      onClick={() => setSelectedCollection(null)}
                      className="btn-white"
                      style={{ padding: '8px 18px', margin: '0 auto', gap: '6px' }}
                    >
                      <Layers size={14} /> Browse All Reels
                    </button>
                  ) : session.is_instagram_linked ? (
                    <a
                      href="https://ig.me/m/reeldex.io"
                      target="_blank"
                      rel="noreferrer"
                      className="btn-coral"
                      style={{ padding: '9px 20px', margin: '0 auto', textDecoration: 'none' }}
                    >
                      <InstagramIcon size={14} /> Open Instagram DM (@reeldex.io)
                    </a>
                  ) : (
                    <button onClick={handleGeneratePairingCode} className="btn-coral" style={{ padding: '9px 20px', margin: '0 auto' }}>
                      <InstagramIcon size={14} /> Link Instagram Account
                    </button>
                  )}
                </div>
              ) : (
                <div className="reels-studio-grid">
                  {reels.map((reel) => (
                    <div
                      key={reel.id}
                      className="studio-card"
                      style={{ cursor: 'pointer' }}
                      onClick={() => { setShowTranslated(false); openReelDetail(reel); }}
                    >
                      {/* Video Thumbnail Cover */}
                      {reel.thumbnail_url && (
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          height: '170px',
                          backgroundColor: '#0f172a',
                          overflow: 'hidden'
                        }}>
                          <img
                            src={reel.thumbnail_url}
                            alt={reel.title || 'Reel Thumbnail'}
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                            onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                          />
                          <div style={{
                            position: 'absolute',
                            inset: 0,
                            background: 'linear-gradient(to top, rgba(15, 23, 42, 0.7) 0%, transparent 60%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <div style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '50%',
                              background: 'rgba(255, 255, 255, 0.95)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
                            }}>
                              <Play size={16} color="#0f172a" style={{ marginLeft: '2px' }} />
                            </div>
                          </div>

                          {reel.duration && (
                            <span style={{
                              position: 'absolute',
                              bottom: '8px',
                              right: '8px',
                              background: 'rgba(0, 0, 0, 0.8)',
                              color: '#ffffff',
                              fontSize: '0.68rem',
                              fontWeight: '700',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              {Math.round(reel.duration)}s
                            </span>
                          )}
                        </div>
                      )}

                      {/* Card Body */}
                      <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1 }}>
                        <div>
                          {/* Tags & Action Icons */}
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                              <span className="pill-category">
                                {reel.category || 'General'}
                              </span>
                              {reel.collection_name && (
                                <span className="pill-collection">
                                  <Folder size={11} color="#ff5722" /> {reel.collection_name}
                                </span>
                              )}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                              {/* Move to Folder Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenCollectionPickerId(openCollectionPickerId === reel.id ? null : reel.id);
                                }}
                                style={{ background: 'none', border: 'none', color: reel.collection_name ? '#ff5722' : '#94a3b8', cursor: 'pointer', padding: '3px' }}
                                title="Move to Collection"
                              >
                                <Folder size={14} />
                              </button>

                              {/* Collection Picker Popover */}
                              {openCollectionPickerId === reel.id && (
                                <div
                                  onClick={(e) => e.stopPropagation()}
                                  style={{
                                    position: 'absolute',
                                    top: '24px',
                                    right: '0',
                                    width: '190px',
                                    background: '#ffffff',
                                    borderRadius: '10px',
                                    boxShadow: 'var(--shadow-lg)',
                                    border: '1px solid var(--border-light)',
                                    padding: '8px',
                                    zIndex: 100
                                  }}
                                >
                                  <div style={{ fontSize: '0.7rem', fontWeight: '800', color: 'var(--text-muted)', padding: '2px 4px 6px', textTransform: 'uppercase' }}>
                                    Move to Collection:
                                  </div>

                                  {collections.length === 0 ? (
                                    <div style={{ padding: '4px' }}>
                                      <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: '1.4' }}>
                                        No collections yet.
                                      </p>
                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenCollectionPickerId(null);
                                          setShowCreateCollectionModal(true);
                                        }}
                                        className="btn-coral"
                                        style={{
                                          width: '100%',
                                          fontSize: '0.74rem',
                                          padding: '6px 10px',
                                          justifyContent: 'center'
                                        }}
                                      >
                                        <Plus size={12} /> New Collection
                                      </button>
                                    </div>
                                  ) : (
                                    <>
                                      {collections.map((col) => (
                                        <button
                                          key={col.id}
                                          onClick={(e) => handleAssignCollection(reel.id, col.id, e)}
                                          style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '6px 8px',
                                            borderRadius: '6px',
                                            background: reel.collection_id === col.id ? 'var(--accent-primary-light)' : 'transparent',
                                            border: 'none',
                                            fontSize: '0.78rem',
                                            fontWeight: '600',
                                            color: reel.collection_id === col.id ? '#ff5722' : 'var(--text-body)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginBottom: '2px'
                                          }}
                                        >
                                          <Folder size={12} color={reel.collection_id === col.id ? "#ff5722" : "currentColor"} />
                                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
                                        </button>
                                      ))}

                                      <button
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setOpenCollectionPickerId(null);
                                          setShowCreateCollectionModal(true);
                                        }}
                                        style={{
                                          width: '100%',
                                          textAlign: 'left',
                                          padding: '6px 8px',
                                          borderRadius: '6px',
                                          background: 'transparent',
                                          border: 'none',
                                          borderTop: '1px solid var(--border-light)',
                                          fontSize: '0.74rem',
                                          fontWeight: '700',
                                          color: '#ff5722',
                                          cursor: 'pointer',
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '4px',
                                          marginTop: '4px'
                                        }}
                                      >
                                        <Plus size={12} /> Create Collection
                                      </button>

                                      {reel.collection_id && (
                                        <button
                                          onClick={(e) => handleAssignCollection(reel.id, null, e)}
                                          style={{
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '5px 8px',
                                            borderRadius: '6px',
                                            background: 'transparent',
                                            border: 'none',
                                            fontSize: '0.72rem',
                                            color: '#ef4444',
                                            cursor: 'pointer'
                                          }}
                                        >
                                          ✕ Remove from folder
                                        </button>
                                      )}
                                    </>
                                  )}
                                </div>
                              )}

                              <button
                                onClick={(e) => handleDeleteReel(reel.id, e)}
                                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '3px' }}
                                title="Delete"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Title & Author */}
                          <h4 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-heading)', letterSpacing: '-0.02em', marginBottom: '3px', lineHeight: '1.4' }}>
                            {reel.title || `Reel by @${reel.author || 'Creator'}`}
                          </h4>
                          
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '500', marginBottom: '10px' }}>
                            by @{reel.author || reel.sender_username || 'creator'} {reel.duration ? `• ${Math.round(reel.duration)}s` : ''}
                          </div>

                          {/* AI Summary Preview */}
                          <p style={{
                            fontSize: '0.84rem',
                            color: 'var(--text-body)',
                            lineHeight: '1.55',
                            marginBottom: '12px',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden'
                          }}>
                            {formatSummary(reel.summary) || reel.preview_text || 'Transcribing spoken audio...'}
                          </p>

                          {/* Action Item Pill */}
                          {(() => {
                            const firstAction = (reel.action_items || []).map(formatActionItem).find(act => act && act.trim().length > 0 && !act.startsWith('{'));
                            if (!firstAction) return null;
                            return (
                              <div style={{ marginBottom: '10px' }}>
                                <span className="pill-tool">
                                  🛠️ {firstAction}
                                </span>
                              </div>
                            );
                          })()}
                        </div>

                        {/* Card Footer */}
                        <div style={{
                          borderTop: '1px solid var(--border-light)',
                          paddingTop: '10px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.76rem'
                        }}>
                          <span style={{ color: 'var(--text-muted)' }}>
                            {reel.created_at ? new Date(reel.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#ff5722', fontWeight: '700' }}>
                            View Notes <ArrowRight size={13} />
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ASK AI COPILOT */}
          {activeTab === 'chat' && (
            <div className="studio-card" style={{ padding: '24px', minHeight: '640px', display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border-light)', paddingBottom: '14px' }}>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-heading)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Bot size={20} color="#ff5722" /> ReelDex AI Copilot
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    High-density Grounded BM25 Knowledge Retrieval across all saved reels
                  </p>
                </div>
              </div>

              {/* Chat Messages */}
              <div style={{ flex: 1, overflowY: 'auto', marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {chatMessages.map((msg, idx) => (
                  <div
                    key={idx}
                    style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%',
                      padding: '12px 16px',
                      borderRadius: '14px',
                      background: msg.role === 'user' ? '#0f172a' : '#f8fafc',
                      color: msg.role === 'user' ? '#ffffff' : 'var(--text-heading)',
                      border: msg.role === 'user' ? 'none' : '1px solid var(--border-light)',
                      fontSize: '0.88rem',
                      lineHeight: '1.6'
                    }}
                  >
                    {msg.role === 'user' ? (
                      msg.content
                    ) : (
                      <div className="markdown-prose">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '12px', background: '#f8fafc', border: '1px solid var(--border-light)', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={15} color="#ff5722" className="animate-spin" /> Synthesizing answer across your video transcripts...
                  </div>
                )}
                <div ref={chatBottomRef} />
              </div>

              {/* Suggested Prompt Chips */}
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                {[
                  "What tools or promo codes were mentioned?",
                  "Summarize all career advice I saved",
                  "List all fitness routines"
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setChatQuestion(prompt)}
                    style={{
                      fontSize: '0.74rem',
                      padding: '4px 10px',
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
              <form onSubmit={handleAskAI} style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  placeholder="Ask a question across all your saved Reels..."
                  value={chatQuestion}
                  onChange={(e) => setChatQuestion(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--border-light)',
                    background: '#ffffff',
                    outline: 'none',
                    fontSize: '0.88rem'
                  }}
                />
                <button type="submit" disabled={chatLoading || !chatQuestion.trim()} className="btn-coral" style={{ padding: '0 20px' }}>
                  <Send size={15} />
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* ======================================================== */}
      {/* CREATE COLLECTION MODAL */}
      {/* ======================================================== */}
      {showCreateCollectionModal && (
        <div className="modal-overlay" onClick={() => setShowCreateCollectionModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderPlus size={18} color="#ff5722" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-heading)' }}>New Collection</h3>
              </div>
              <button onClick={() => setShowCreateCollectionModal(false)} className="btn-white" style={{ padding: '4px 8px' }}>✕</button>
            </div>

            <form onSubmit={handleCreateCollection}>
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  COLLECTION NAME
                </label>
                <input
                  type="text"
                  placeholder="e.g. Startup Ideas, Workout Routines, AI Tools..."
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreateCollectionModal(false)} className="btn-white">Cancel</button>
                <button type="submit" disabled={!newCollectionName.trim()} className="btn-coral">
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* INSTAGRAM PAIRING MODAL */}
      {/* ======================================================== */}
      {showPairModal && (
        <div className="modal-overlay" onClick={() => setShowPairModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'linear-gradient(135deg, #ff5722, #f43f5e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <InstagramIcon size={18} color="#fff" />
                </div>
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-heading)' }}>Link Your Instagram</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sync reels via Instagram DM in 10 seconds</p>
                </div>
              </div>
              <button onClick={() => setShowPairModal(false)} className="btn-white" style={{ padding: '4px 8px' }}>✕</button>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '20px', textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Your Unique Linking Code
              </span>
              <div style={{ fontSize: '2rem', fontWeight: '900', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', color: '#ff5722', margin: '6px 0' }}>
                {pairingCode || 'MIND-849201'}
              </div>
              <button onClick={() => copyText(pairingCode)} className="btn-white" style={{ fontSize: '0.78rem' }}>
                {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />} Copy Code
              </button>
            </div>

            <div style={{ fontSize: '0.84rem', color: 'var(--text-body)', lineHeight: '1.6', marginBottom: '20px' }}>
              <ol style={{ paddingLeft: '18px' }}>
                <li>Open Instagram Direct and message <strong>@reeldex.io</strong>.</li>
                <li>Send your code: <code style={{ color: '#ff5722', fontWeight: '700' }}>{pairingCode}</code></li>
                <li>Done! Any Reel you share in DM will automatically transcribe and save here.</li>
              </ol>
            </div>

            <a
              href="https://ig.me/m/reeldex.io"
              target="_blank"
              rel="noreferrer"
              className="btn-coral"
              style={{ width: '100%', justifyContent: 'center', padding: '10px' }}
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
          <div className="modal-sheet" onClick={e => e.stopPropagation()}>
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <span className="pill-category">
                    {selectedReel.category || 'General'}
                  </span>
                  {selectedReel.collection_name && (
                    <span className="pill-collection">
                      <Folder size={11} color="#ff5722" /> {selectedReel.collection_name}
                    </span>
                  )}
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-heading)', marginTop: '6px', letterSpacing: '-0.02em' }}>
                  {selectedReel.title || `Reel by @${selectedReel.author || 'Creator'}`}
                </h3>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '500' }}>
                  by @{selectedReel.author || selectedReel.sender_username} {selectedReel.duration ? `• ${Math.round(selectedReel.duration)}s` : ''}
                </p>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={() => copyText(
                    showTranslated 
                      ? (selectedReel.transcript?.translated_text || selectedReel.transcript?.full_text || '') 
                      : (selectedReel.transcript?.full_text || selectedReel.preview_text || '')
                  )}
                  className="btn-white"
                  title="Copy Transcript"
                >
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                </button>
                {selectedReel.transcript && (
                  <button
                    onClick={() => downloadSRT(selectedReel)}
                    className="btn-white"
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
                    className="btn-white"
                    title="Open on Instagram"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
                <button onClick={() => setSelectedReel(null)} className="btn-white">✕</button>
              </div>
            </div>

            {/* Modal Video Thumbnail Preview */}
            {selectedReel.thumbnail_url && (
              <div style={{
                position: 'relative',
                width: '100%',
                height: '180px',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                marginBottom: '16px',
                backgroundColor: '#0f172a'
              }}>
                <img
                  src={selectedReel.thumbnail_url}
                  alt={selectedReel.title || 'Reel Thumbnail'}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.currentTarget.parentElement.style.display = 'none'; }}
                />
                {selectedReel.reel_url && (
                  <a
                    href={selectedReel.reel_url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(15, 23, 42, 0.7) 0%, transparent 60%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      textDecoration: 'none'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '7px 16px',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(255, 255, 255, 0.95)',
                      color: '#0f172a',
                      fontWeight: '700',
                      fontSize: '0.8rem',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.3)'
                    }}>
                      <Play size={13} color="#0f172a" style={{ fill: '#0f172a' }} /> Play Original on Instagram <ExternalLink size={11} />
                    </div>
                  </a>
                )}
              </div>
            )}

            {/* Folder Move & Translation Toolbar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
              border: '1px solid var(--border-light)',
              borderRadius: '10px',
              padding: '8px 12px',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '8px'
            }}>
              {/* Folder Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                  Folder:
                </span>
                <select
                  value={selectedReel.collection_id || ''}
                  onChange={(e) => handleAssignCollection(selectedReel.id, e.target.value ? parseInt(e.target.value) : null)}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.78rem',
                    background: '#ffffff',
                    fontWeight: '600',
                    color: 'var(--text-heading)',
                    outline: 'none'
                  }}
                >
                  <option value="">(Unassigned)</option>
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* On-Demand Translation */}
              {selectedReel.transcript && (
                <div>
                  {selectedReel.transcript.translated_text ? (
                    <button
                      onClick={() => setShowTranslated(!showTranslated)}
                      className="btn-white"
                      style={{
                        fontSize: '0.76rem',
                        padding: '4px 10px',
                        background: showTranslated ? 'rgba(59, 130, 246, 0.08)' : '#ffffff',
                        borderColor: showTranslated ? '#3b82f6' : 'var(--border-light)',
                        color: showTranslated ? '#2563eb' : 'var(--text-heading)',
                        fontWeight: '700'
                      }}
                    >
                      <Globe size={13} color={showTranslated ? "#2563eb" : "#ff5722"} />
                      {showTranslated ? 'Viewing English Translation' : 'Translate to English'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTranslateReel(selectedReel.id)}
                      disabled={translating}
                      className="btn-white"
                      style={{ fontSize: '0.76rem', padding: '4px 10px', color: '#ff5722', fontWeight: '700' }}
                    >
                      <Languages size={13} />
                      {translating ? 'Translating with Groq AI...' : 'Translate to English'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Translation Active Alert */}
            {showTranslated && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '0.76rem',
                color: '#1d4ed8',
                fontWeight: '600',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Sparkles size={13} /> English translation cached permanently (0 tokens used on future views)
              </div>
            )}

            {/* Unified AI Summary & Key Takeaways Card */}
            {(selectedReel.transcript?.summary || (selectedReel.action_items && selectedReel.action_items.length > 0)) && (
              <div style={{
                padding: '18px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 87, 34, 0.04)',
                border: '1px solid rgba(255, 87, 34, 0.15)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: '800', color: '#ff5722', marginBottom: '8px' }}>
                  <Sparkles size={14} /> AI SUMMARY & KEY TAKEAWAYS
                </div>

                {selectedReel.transcript?.summary && (
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-heading)', lineHeight: '1.6', marginBottom: (selectedReel.transcript.key_points?.length || selectedReel.action_items?.length) ? '10px' : '0' }}>
                    {formatSummary(showTranslated && selectedReel.transcript?.translated_summary ? selectedReel.transcript.translated_summary : selectedReel.transcript.summary)}
                  </p>
                )}

                {selectedReel.transcript?.key_points?.length > 0 && !showTranslated && (
                  <ul style={{ paddingLeft: '18px', fontSize: '0.84rem', color: 'var(--text-body)', lineHeight: '1.6' }}>
                    {selectedReel.transcript.key_points.map((pt, i) => (
                      <li key={i} style={{ marginBottom: '3px' }}>{formatSummary(pt)}</li>
                    ))}
                  </ul>
                )}

                {/* Extracted Tools & Action Steps */}
                {(() => {
                  const validActions = (selectedReel.action_items || [])
                    .map(formatActionItem)
                    .filter(act => act && act.trim().length > 0 && !act.startsWith('{'));

                  if (validActions.length === 0) return null;

                  return (
                    <div style={{
                      marginTop: '10px',
                      paddingTop: '10px',
                      borderTop: '1px solid rgba(255, 87, 34, 0.12)'
                    }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: '800', color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '4px' }}>
                        🛠️ Extracted Tools & Action Steps:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {validActions.map((act, i) => (
                          <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-heading)' }}>
                            • {act}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Word-For-Word Transcript */}
            <div>
              <div style={{ fontSize: '0.78rem', fontWeight: '800', color: 'var(--text-heading)', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>FULL WORD-FOR-WORD TRANSCRIPT</span>
                {showTranslated && (
                  <span style={{ fontSize: '0.7rem', color: '#2563eb', fontWeight: '700' }}>
                    ENGLISH TRANSLATION
                  </span>
                )}
              </div>
              <div style={{
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                background: '#f8fafc',
                border: '1px solid var(--border-light)',
                fontSize: '0.84rem',
                lineHeight: '1.65',
                whiteSpace: 'pre-wrap'
              }}>
                {showTranslated 
                  ? (selectedReel.transcript?.translated_text || selectedReel.transcript?.full_text || 'No translation available.')
                  : (selectedReel.transcript?.full_text || selectedReel.preview_text || 'Transcription processing...')}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
