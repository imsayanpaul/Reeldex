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

  // Custom Collections / Folders State
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionEmoji, setNewCollectionEmoji] = useState('📁');
  const [openCollectionPickerId, setOpenCollectionPickerId] = useState(null);

  // On-Demand Translation State
  const [translating, setTranslating] = useState(false);
  const [showTranslated, setShowTranslated] = useState(false);

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
    fetchCollections(currentToken);
    fetchReels(currentToken);
  }, []);

  // 2. Fetch Reels when Category, Collection or Search Query Changes
  useEffect(() => {
    fetchReels();
    const interval = setInterval(fetchReels, 4000);
    return () => clearInterval(interval);
  }, [session?.auth_token, selectedCategory, selectedCollection, searchQuery]);

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

  const handleCreateCollection = async (e) => {
    if (e) e.preventDefault();
    if (!newCollectionName.trim()) return;
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/collections?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCollectionName.trim(), emoji: newCollectionEmoji })
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
    if (!window.confirm('Delete this collection? (Reels inside will not be deleted)')) return;
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
          collection_name: data.collection_name, 
          collection_emoji: data.collection_emoji 
        } : r));
        if (selectedReel?.id === reelId) {
          setSelectedReel(prev => ({ 
            ...prev, 
            collection_id: data.collection_id, 
            collection_name: data.collection_name, 
            collection_emoji: data.collection_emoji 
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

    const userMsg = { role: 'user', content: chatQuestion.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatQuestion('');
    setChatLoading(true);

    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      let res = await fetch(`${API_BASE}/chat/ask`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'token': token
        },
        body: JSON.stringify({ question: userMsg.content, token })
      });

      if (!res.ok) {
        // Fallback to /ask endpoint
        res = await fetch(`${API_BASE}/ask`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'token': token
          },
          body: JSON.stringify({ question: userMsg.content, token })
        });
      }

      if (res.ok) {
        const data = await res.json();
        const aiAnswer = data.answer || data.text || data.response || data.message || "I couldn't find relevant reels for this query in your vault.";
        const aiMsg = {
          role: 'assistant',
          content: aiAnswer,
          citations: Array.isArray(data.citations) ? data.citations : []
        };
        setChatMessages(prev => [...prev, aiMsg]);
      } else {
        throw new Error(`API responded with ${res.status}`);
      }
    } catch (err) {
      console.error('Ask AI error:', err);
      setChatMessages(prev => [
        ...prev,
        { role: 'assistant', content: '⚠️ Sorry, I encountered an issue searching your knowledge base. Please verify your connection and try again.' }
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
        <div className="header-container-responsive">
          
          {/* Brand Logo Wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => setActiveTab('vault')}>
            <div style={{ fontSize: '1.45rem', fontWeight: '900', letterSpacing: '-0.04em', color: '#0f172a' }}>
              Reel<span style={{ color: '#ff5722' }}>Dex</span>
            </div>
          </div>

          {/* Desktop Capsule Tab Switcher */}
          <nav className="nav-capsule header-nav-desktop">
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

        {/* Mobile Sub-Header Navigation */}
        <div className="header-nav-mobile">
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
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN VIEWPORT CONTAINER */}
      {/* ======================================================== */}
      <main style={{ maxWidth: '1240px', width: '100%', margin: '0 auto', padding: '20px 16px 40px', flex: 1 }}>

        {/* TAB 1: KNOWLEDGE VAULT */}
        {activeTab === 'vault' && (
          <div>
            
            {/* HERO PROMOTIONAL BANNER */}
            <div className="hero-banner-responsive">
              
              {/* Left Content */}
              <div>
                <h1 className="hero-heading-responsive">
                  Turn Saved Reels.<br />
                  Into Second Brain.<br />
                  All in One Place.
                </h1>

                <p style={{
                  fontSize: '0.88rem',
                  lineHeight: '1.55',
                  color: 'rgba(255, 255, 255, 0.92)',
                  maxWidth: '520px',
                  marginBottom: '20px'
                }}>
                  Stop losing valuable advice in your Instagram saved folder. Automatically transcribe audio, extract tools & action items, and search everything with AI.
                </p>

                {/* Search Bar inside Hero */}
                <div className="hero-search-box-responsive">
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
                      padding: '8px 10px',
                      fontSize: '0.88rem',
                      fontFamily: 'inherit',
                      color: '#0f172a'
                    }}
                  />
                  
                  <button
                    onClick={() => fetchReels()}
                    className="btn-dark"
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
                </div>
              </div>
            </div>

            {/* Custom Collections / Folders Strip */}
            <div style={{ marginBottom: '20px', background: '#f8fafc', padding: '12px 16px', borderRadius: '16px', border: '1px solid var(--border-light)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-heading)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  <Folder size={14} color="#ff5722" /> Custom Collections
                </div>
                <button
                  onClick={() => setShowCreateCollectionModal(true)}
                  className="btn-white"
                  style={{ fontSize: '0.76rem', padding: '4px 10px', display: 'flex', alignItems: 'center', gap: '4px', color: '#ff5722', fontWeight: '700' }}
                >
                  <Plus size={13} /> New Collection
                </button>
              </div>

              <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '2px' }} className="no-scrollbar">
                <button
                  onClick={() => setSelectedCollection(null)}
                  className={`trending-chip ${selectedCollection === null ? 'active' : ''}`}
                  style={{ padding: '6px 14px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Folder size={13} /> All Reels
                </button>

                {collections.map((col) => (
                  <div key={col.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <button
                      onClick={() => setSelectedCollection(selectedCollection?.id === col.id ? null : col)}
                      className={`trending-chip ${selectedCollection?.id === col.id ? 'active' : ''}`}
                      style={{ padding: '6px 14px', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                      <Folder size={13} />
                      <span>{col.name}</span>
                      <span style={{ opacity: 0.7, fontSize: '0.72rem' }}>({col.count})</span>
                    </button>
                    {selectedCollection?.id === col.id && (
                      <button
                        onClick={(e) => handleDeleteCollection(col.id, e)}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
                        title="Delete Collection"
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Results Title Bar & Categories Filter */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-heading)', letterSpacing: '-0.02em' }}>
                  {selectedCollection ? selectedCollection.name : (selectedCategory === 'All' ? 'All Saved Knowledge' : selectedCategory)}
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
                  {selectedCollection ? `No reels in "${selectedCollection.name}" yet` : 'Your Knowledge Vault is Ready'}
                </h3>
                <p style={{ color: 'var(--text-body)', fontSize: '0.88rem', lineHeight: '1.6', marginBottom: '24px', maxWidth: '440px', margin: '0 auto 24px' }}>
                  {selectedCollection 
                    ? 'Assign reels to this collection using the folder icon on any reel card!' 
                    : 'Send any Instagram Reel in DM to @reeldex.io. Our AI engine will transcribe speech, extract tools, and file it here automatically!'}
                </p>

                <button onClick={handleGeneratePairingCode} className="btn-coral" style={{ padding: '10px 24px' }}>
                  <InstagramIcon size={15} /> Connect Your Instagram
                </button>
              </div>
            ) : (
              <div className="reels-grid-responsive">
                {reels.map((reel) => (
                  <div
                    key={reel.id}
                    className="clean-card clean-card-hover"
                    style={{ padding: '22px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative' }}
                    onClick={() => { setShowTranslated(false); openReelDetail(reel); }}
                  >
                    <div>
                      {/* Video Thumbnail Cover */}
                      {reel.thumbnail_url && (
                        <div style={{
                          position: 'relative',
                          width: '100%',
                          height: '160px',
                          borderRadius: '14px',
                          overflow: 'hidden',
                          marginBottom: '14px',
                          backgroundColor: '#0f172a'
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
                            background: 'linear-gradient(to top, rgba(15, 23, 42, 0.6) 0%, transparent 60%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '50%',
                              background: 'rgba(255, 255, 255, 0.92)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)'
                            }}>
                              <Play size={15} color="#0f172a" style={{ marginLeft: '2px' }} />
                            </div>
                          </div>

                          {reel.duration && (
                            <span style={{
                              position: 'absolute',
                              bottom: '8px',
                              right: '8px',
                              background: 'rgba(0, 0, 0, 0.75)',
                              color: '#ffffff',
                              fontSize: '0.7rem',
                              fontWeight: '700',
                              padding: '2px 6px',
                              borderRadius: '4px'
                            }}>
                              {Math.round(reel.duration)}s
                            </span>
                          )}
                        </div>
                      )}

                      {/* Top Header: Category, Collection Tag & Actions */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span className="pill-category">
                            {reel.category || 'General'}
                          </span>
                          {reel.collection_name && (
                            <span style={{
                              fontSize: '0.72rem',
                              background: 'rgba(255, 87, 34, 0.08)',
                              color: '#ff5722',
                              fontWeight: '700',
                              padding: '3px 8px',
                              borderRadius: '6px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}>
                              <Folder size={12} color="#ff5722" /> {reel.collection_name}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', position: 'relative' }}>
                          {/* Assign to Collection Button */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenCollectionPickerId(openCollectionPickerId === reel.id ? null : reel.id);
                            }}
                            style={{ background: 'none', border: 'none', color: reel.collection_name ? '#ff5722' : '#94a3b8', cursor: 'pointer', padding: '3px' }}
                            title="Assign to Collection"
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
                                width: '180px',
                                background: '#ffffff',
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
                                border: '1px solid var(--border-light)',
                                padding: '8px',
                                zIndex: 100
                              }}
                            >
                              <div style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-muted)', padding: '4px 6px', textTransform: 'uppercase' }}>
                                Move to Collection:
                              </div>
                              {collections.map((col) => (
                                <button
                                  key={col.id}
                                  onClick={(e) => handleAssignCollection(reel.id, col.id, e)}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    background: reel.collection_id === col.id ? 'rgba(255, 87, 34, 0.1)' : 'transparent',
                                    border: 'none',
                                    fontSize: '0.78rem',
                                    fontWeight: '600',
                                    color: reel.collection_id === col.id ? '#ff5722' : 'var(--text-body)',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                  }}
                                >
                                  <Folder size={13} color={reel.collection_id === col.id ? "#ff5722" : "currentColor"} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{col.name}</span>
                                </button>
                              ))}
                              {reel.collection_id && (
                                <button
                                  onClick={(e) => handleAssignCollection(reel.id, null, e)}
                                  style={{
                                    width: '100%',
                                    textAlign: 'left',
                                    padding: '6px 8px',
                                    borderRadius: '6px',
                                    background: 'transparent',
                                    border: 'none',
                                    borderTop: '1px solid var(--border-light)',
                                    fontSize: '0.74rem',
                                    color: '#ef4444',
                                    cursor: 'pointer',
                                    marginTop: '4px'
                                  }}
                                >
                                  ✕ Remove from collection
                                </button>
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
                      {(() => {
                        const firstAction = (reel.action_items || []).map(formatActionItem).find(act => act && act.trim().length > 0 && !act.startsWith('{'));
                        if (!firstAction) return null;
                        return (
                          <div style={{ marginBottom: '12px' }}>
                            <span className="pill-tool">
                              🛠️ {firstAction}
                            </span>
                          </div>
                        );
                      })()}

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
                        <Clock size={13} /> View Transcript & Insights
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
          <div className="clean-card" style={{ padding: '24px', minHeight: '620px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--text-heading)', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bot size={22} color="#ff5722" /> Ask AI Across All Saved Reels
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  Grounded BM25 Knowledge Retrieval across your full personal library
                </p>
              </div>
            </div>

            {/* Chat Conversation Stream */}
            <div style={{ flex: 1, overflowY: 'auto', marginBottom: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '14px 18px',
                    borderRadius: '16px',
                    background: msg.role === 'user' ? 'linear-gradient(135deg, #ff5722, #f43f5e)' : '#f8fafc',
                    color: msg.role === 'user' ? '#ffffff' : 'var(--text-dark)',
                    border: msg.role === 'user' ? 'none' : '1px solid var(--border-light)',
                    boxShadow: 'var(--shadow-sm)',
                    fontSize: '0.9rem',
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
                <div style={{ alignSelf: 'flex-start', padding: '12px 18px', borderRadius: '16px', background: '#f8fafc', border: '1px solid var(--border-light)', fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={16} color="#ff5722" className="animate-spin" /> Searching your reels and synthesizing answer...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Suggested Prompt Chips */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px' }}>
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
      {/* CREATE COLLECTION MODAL */}
      {/* ======================================================== */}
      {showCreateCollectionModal && (
        <div className="modal-overlay" onClick={() => setShowCreateCollectionModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderPlus size={20} color="#ff5722" />
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: 'var(--text-heading)' }}>Create Collection</h3>
              </div>
              <button onClick={() => setShowCreateCollectionModal(false)} className="btn-white" style={{ padding: '4px 8px' }}>✕</button>
            </div>

            <form onSubmit={handleCreateCollection}>
              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '8px' }}>
                  COLLECTION NAME
                </label>
                <input
                  type="text"
                  placeholder="e.g. Startup Ideas, Gym Workouts, AI Tools..."
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '10px',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.92rem',
                    outline: 'none'
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreateCollectionModal(false)} className="btn-white">Cancel</button>
                <button type="submit" disabled={!newCollectionName.trim()} className="btn-coral" style={{ padding: '8px 22px' }}>
                  Create Collection
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="pill-category">
                    {selectedReel.category || 'General'}
                  </span>
                  {selectedReel.collection_name && (
                    <span style={{
                      fontSize: '0.72rem',
                      background: 'rgba(255, 87, 34, 0.08)',
                      color: '#ff5722',
                      fontWeight: '700',
                      padding: '3px 8px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Folder size={12} color="#ff5722" /> {selectedReel.collection_name}
                    </span>
                  )}
                </div>
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
                  onClick={() => copyText(
                    showTranslated 
                      ? (selectedReel.transcript?.translated_text || selectedReel.transcript?.full_text || '') 
                      : (selectedReel.transcript?.full_text || selectedReel.preview_text || '')
                  )}
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

            {/* Modal Video Thumbnail Preview */}
            {selectedReel.thumbnail_url && (
              <div style={{
                position: 'relative',
                width: '100%',
                height: '190px',
                borderRadius: '16px',
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
                      gap: '8px',
                      padding: '8px 18px',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(255, 255, 255, 0.95)',
                      color: '#0f172a',
                      fontWeight: '700',
                      fontSize: '0.82rem',
                      boxShadow: '0 4px 16px rgba(0,0,0,0.3)'
                    }}>
                      <Play size={14} color="#0f172a" style={{ fill: '#0f172a' }} /> Play Original on Instagram <ExternalLink size={12} />
                    </div>
                  </a>
                )}
              </div>
            )}

            {/* Collection Selector & On-Demand Translation Bar */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#f8fafc',
              border: '1px solid var(--border-light)',
              borderRadius: '12px',
              padding: '10px 14px',
              marginBottom: '16px',
              flexWrap: 'wrap',
              gap: '10px'
            }}>
              {/* Collection Dropdown */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: '700' }}>
                  📁 Collection:
                </span>
                <select
                  value={selectedReel.collection_id || ''}
                  onChange={(e) => handleAssignCollection(selectedReel.id, e.target.value ? parseInt(e.target.value) : null)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    fontSize: '0.8rem',
                    background: '#ffffff',
                    fontWeight: '600',
                    color: 'var(--text-heading)',
                    outline: 'none'
                  }}
                >
                  <option value="">(None - Unassigned)</option>
                  {collections.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* On-Demand Audio Translation Button */}
              {selectedReel.transcript && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {selectedReel.transcript.translated_text ? (
                    <button
                      onClick={() => setShowTranslated(!showTranslated)}
                      className="btn-white"
                      style={{
                        fontSize: '0.78rem',
                        padding: '5px 12px',
                        background: showTranslated ? 'rgba(59, 130, 246, 0.1)' : '#ffffff',
                        borderColor: showTranslated ? '#3b82f6' : 'var(--border-light)',
                        color: showTranslated ? '#2563eb' : 'var(--text-heading)',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Globe size={14} color={showTranslated ? "#2563eb" : "#ff5722"} />
                      {showTranslated ? '🌐 Viewing English Translation' : '🌐 Translate to English'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTranslateReel(selectedReel.id)}
                      disabled={translating}
                      className="btn-white"
                      style={{
                        fontSize: '0.78rem',
                        padding: '5px 12px',
                        color: '#ff5722',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}
                    >
                      <Languages size={14} />
                      {translating ? 'Translating with Groq AI...' : '🌐 Translate to English'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Translation Active Notice */}
            {showTranslated && (
              <div style={{
                background: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '8px',
                padding: '8px 12px',
                fontSize: '0.78rem',
                color: '#1d4ed8',
                fontWeight: '600',
                marginBottom: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <Sparkles size={14} /> English translation generated & cached in DB (0 tokens used on future views)
              </div>
            )}

            {/* Unified AI Summary & Key Takeaways Box */}
            {(selectedReel.transcript?.summary || (selectedReel.action_items && selectedReel.action_items.length > 0)) && (
              <div style={{
                padding: '20px',
                borderRadius: 'var(--radius-lg)',
                background: 'rgba(255, 87, 34, 0.05)',
                border: '1px solid rgba(255, 87, 34, 0.15)',
                marginBottom: '18px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: '800', color: '#ff5722', marginBottom: '10px' }}>
                  <Sparkles size={15} /> AI SUMMARY & KEY TAKEAWAYS
                </div>

                {selectedReel.transcript?.summary && (
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-dark)', lineHeight: '1.6', marginBottom: (selectedReel.transcript.key_points?.length || selectedReel.action_items?.length) ? '12px' : '0' }}>
                    {formatSummary(showTranslated && selectedReel.transcript?.translated_summary ? selectedReel.transcript.translated_summary : selectedReel.transcript.summary)}
                  </p>
                )}

                {selectedReel.transcript?.key_points?.length > 0 && !showTranslated && (
                  <ul style={{ paddingLeft: '20px', fontSize: '0.85rem', color: 'var(--text-body)', lineHeight: '1.6' }}>
                    {selectedReel.transcript.key_points.map((pt, i) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{formatSummary(pt)}</li>
                    ))}
                  </ul>
                )}

                {/* Merged Action Items / Tools inside unified card */}
                {(() => {
                  const validActions = (selectedReel.action_items || [])
                    .map(formatActionItem)
                    .filter(act => act && act.trim().length > 0 && !act.startsWith('{'));

                  if (validActions.length === 0) return null;

                  return (
                    <div style={{
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: '1px solid rgba(255, 87, 34, 0.12)'
                    }}>
                      <div style={{ fontSize: '0.74rem', fontWeight: '800', color: '#ea580c', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '6px' }}>
                        🛠️ Tools & Action Steps:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {validActions.map((act, i) => (
                          <div key={i} style={{ fontSize: '0.84rem', color: 'var(--text-dark)' }}>
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
            <div style={{ marginBottom: '18px' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '800', color: 'var(--text-heading)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>FULL WORD-FOR-WORD TRANSCRIPT</span>
                {showTranslated && (
                  <span style={{ fontSize: '0.72rem', color: '#2563eb', fontWeight: '700' }}>
                    ENGLISH TRANSLATION
                  </span>
                )}
              </div>
              <div style={{
                maxHeight: '260px',
                overflowY: 'auto',
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: '#f8fafc',
                border: '1px solid var(--border-light)',
                fontSize: '0.86rem',
                lineHeight: '1.7',
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
