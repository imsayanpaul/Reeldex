import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  Search, 
  Sparkles, 
  ExternalLink, 
  Copy, 
  Check, 
  Trash2, 
  Bot, 
  Download, 
  Send,
  ArrowLeft,
  Folder,
  FolderPlus,
  Languages,
  Globe,
  Plus,
  X,
  Play,
  Lock,
  Bookmark,
  Layers,
  Tag
} from 'lucide-react';

const InstagramIcon = ({ size = 16, color = "currentColor", style }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={style}>
    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
  </svg>
);

// Formatting helpers
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
  const [activeViewFilter, setActiveViewFilter] = useState('All'); // 'All' | 'Collections' | Category string

  // User & Pairing State
  const initialToken = getInitialToken();
  const cachedName = getSafeStorage('reelmind_display_name') || 'User #3832';
  const cachedLinked = getSafeStorage('reelmind_is_linked') === 'true';
  const [session, setSession] = useState({ 
    auth_token: initialToken, 
    display_name: cachedName,
    is_instagram_linked: cachedLinked
  });
  const [showPairModal, setShowPairModal] = useState(false);
  const [pairingCode, setPairingCode] = useState(null);

  // Vault, Collections & Search State
  const [reels, setReels] = useState([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [categories, setCategories] = useState(['All']);
  const [collections, setCollections] = useState([]);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReel, setSelectedReel] = useState(null);

  // Collection Creator & Popover
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
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
          if (data.display_name) setSafeStorage('reelmind_display_name', data.display_name);
          if (data.is_instagram_linked !== undefined) setSafeStorage('reelmind_is_linked', String(data.is_instagram_linked));
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
  }, [session?.auth_token, activeViewFilter, selectedCollection, searchQuery]);

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
      const categoryParam = (activeViewFilter === 'All' || activeViewFilter === 'Collections') ? 'All' : activeViewFilter;
      let url = `${API_BASE}/reels?token=${token}&category=${encodeURIComponent(categoryParam)}`;
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
    } finally {
      setInitialLoading(false);
    }
  };

  const handleGeneratePairingCode = async () => {
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
    }
  };

  const handleCreateCollection = async (e) => {
    if (e) e.preventDefault();
    if (!newCollectionName.trim() || creatingCollection) return;
    setCreatingCollection(true);
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
        await fetchCollections(token);
        setSelectedCollection(newCol);
      }
    } catch (err) {
      console.error('Error creating collection:', err);
    } finally {
      setCreatingCollection(false);
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

  // Find cover thumbnail for collection from reels in that collection
  const getCollectionCover = (collectionId) => {
    const matchingReel = reels.find(r => r.collection_id === collectionId && r.thumbnail_url);
    return matchingReel?.thumbnail_url || null;
  };

  return (
    <div className="ig-app-wrapper">
      {/* ======================================================== */}
      {/* INSTAGRAM-STYLE STICKY TOP NAVBAR */}
      {/* ======================================================== */}
      <header className="ig-top-navbar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {selectedCollection ? (
            <button
              onClick={() => setSelectedCollection(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-heading)', fontWeight: '700', fontSize: '0.95rem' }}
            >
              <ArrowLeft size={18} />
              <span>{selectedCollection.name}</span>
            </button>
          ) : (
            <h1 style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--text-heading)', letterSpacing: '-0.03em', fontFamily: 'var(--font-main)' }}>
              ReelDex
            </h1>
          )}
        </div>

        {/* Center: Search Box */}
        <div style={{ flex: 1, maxWidth: '420px', margin: '0 16px' }}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <Search size={14} color="#8e8e8e" style={{ position: 'absolute', left: '12px' }} />
            <input
              type="text"
              placeholder="Search transcripts & tools..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 32px 7px 34px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border-light)',
                background: 'var(--bg-input)',
                fontSize: '0.84rem',
                outline: 'none',
                color: 'var(--text-main)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '8px', background: 'none', border: 'none', color: '#8e8e8e', cursor: 'pointer' }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Right Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Ask AI Tab Toggle */}
          <button
            onClick={() => setActiveTab(activeTab === 'vault' ? 'chat' : 'vault')}
            className={`ig-filter-pill ${activeTab === 'chat' ? 'active' : ''}`}
            title="Ask AI across your saved reels"
          >
            Ask AI
          </button>

          {/* User / Instagram Status Capsule */}
          <button
            onClick={handleGeneratePairingCode}
            className="ig-filter-pill"
            title="Instagram Connection Status - Click to Pair"
          >
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: session.is_instagram_linked ? '#10b981' : '#f59e0b'
            }} />
            <span>{session.instagram_username ? `@${session.instagram_username}` : (session.display_name || 'User #3832')}</span>
          </button>

          {/* + New Collection Icon Only */}
          <button
            onClick={() => setShowCreateCollectionModal(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: '6px',
              color: 'var(--text-heading)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '50%',
              transition: 'background 0.15s ease'
            }}
            title="Create New Collection"
          >
            <Plus size={22} strokeWidth={2.2} />
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ======================================================== */}
      <div className="ig-content-container">

        {/* Filter Pills (Clean Wrapping Category Strip) */}
        {activeTab === 'vault' && !selectedCollection && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '22px' }}>
            <button
              onClick={() => setActiveViewFilter('All')}
              className={`ig-filter-pill ${activeViewFilter === 'All' ? 'active' : ''}`}
            >
              All
            </button>
            <button
              onClick={() => setActiveViewFilter('Collections')}
              className={`ig-filter-pill ${activeViewFilter === 'Collections' ? 'active' : ''}`}
            >
              Collections
            </button>
            {categories.filter(c => c !== 'All').map(cat => (
              <button
                key={cat}
                onClick={() => setActiveViewFilter(cat)}
                className={`ig-filter-pill ${activeViewFilter === cat ? 'active' : ''}`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* TAB 1: VAULT VIEW */}
        {activeTab === 'vault' && (
          <div>
            {/* 1. COLLECTIONS SECTION (Shown when on 'All' or 'Collections' filter) */}
            {(!selectedCollection && (activeViewFilter === 'All' || activeViewFilter === 'Collections')) && (
              <div style={{ marginBottom: '28px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-heading)' }}>
                    Collections
                  </h2>
                  <button
                    onClick={() => setShowCreateCollectionModal(true)}
                    style={{ background: 'none', border: 'none', color: '#0095f6', fontWeight: '700', fontSize: '0.84rem', cursor: 'pointer' }}
                  >
                    + New Collection
                  </button>
                </div>

                {collections.length === 0 ? (
                  <div style={{
                    padding: '20px',
                    borderRadius: 'var(--radius-lg)',
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-heading)' }}>Organize with Collections</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Group your transcribed reels by theme, work, or project.</div>
                    </div>
                    <button onClick={() => setShowCreateCollectionModal(true)} className="btn-coral" style={{ fontSize: '0.78rem' }}>
                      <Plus size={13} /> Create
                    </button>
                  </div>
                ) : (
                  <div className="ig-collections-grid">
                    {collections.map(col => {
                      const coverImg = getCollectionCover(col.id);
                      return (
                        <div
                          key={col.id}
                          className="ig-collection-card"
                          onClick={() => setSelectedCollection(col)}
                        >
                          <div className="ig-collection-cover">
                            {coverImg ? (
                              <img src={coverImg} alt={col.name} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #18181b, #27272a)' }}>
                                <Folder size={32} color="#ffffff" opacity={0.6} />
                              </div>
                            )}
                          </div>
                          <div style={{ fontSize: '0.88rem', fontWeight: '700', color: 'var(--text-heading)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {col.name}
                          </div>
                          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                            <Lock size={10} /> Private · {col.count} {col.count === 1 ? 'item' : 'items'}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* 2. REELS AND POSTS SECTION (9:16 Vertical Instagram Cards Grid) */}
            {activeViewFilter !== 'Collections' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h2 style={{ fontSize: '1rem', fontWeight: '800', color: 'var(--text-heading)' }}>
                    {selectedCollection ? `${selectedCollection.name} (${reels.length})` : `Reels and posts (${reels.length})`}
                  </h2>
                  {selectedCollection && (
                    <button
                      onClick={(e) => handleDeleteCollection(selectedCollection.id, e)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.8rem', fontWeight: '600', cursor: 'pointer' }}
                    >
                      Delete Collection
                    </button>
                  )}
                </div>

                {initialLoading ? (
                  <div className="ig-reels-grid">
                    {[1, 2, 3].map((n) => (
                      <div key={n} className="modern-reel-card" style={{ opacity: 0.85 }}>
                        <div className="modern-card-thumbnail-box skeleton-shimmer" style={{ minHeight: '190px' }} />
                        <div className="modern-card-body">
                          <div className="skeleton-shimmer" style={{ width: '35%', height: '12px', borderRadius: '4px', marginBottom: '8px' }} />
                          <div className="skeleton-shimmer" style={{ width: '80%', height: '18px', borderRadius: '4px', marginBottom: '10px' }} />
                          <div className="skeleton-shimmer" style={{ width: '100%', height: '36px', borderRadius: '4px', marginBottom: '12px' }} />
                          <div className="skeleton-shimmer" style={{ width: '50%', height: '12px', borderRadius: '4px' }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : reels.length === 0 ? (
                  <div style={{
                    padding: '48px 24px',
                    textAlign: 'center',
                    background: 'var(--bg-card)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--border-light)',
                    maxWidth: '460px',
                    margin: '30px auto'
                  }}>
                    <Bookmark size={28} color="var(--text-heading)" style={{ margin: '0 auto 12px' }} />
                    <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: 'var(--text-heading)', marginBottom: '6px' }}>
                      {selectedCollection ? `No reels in "${selectedCollection.name}" yet` : 'No Saved Reels Found'}
                    </h3>
                    <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', lineHeight: '1.5', marginBottom: '18px' }}>
                      {selectedCollection 
                        ? 'Assign reels to this collection from any reel card using the folder icon!' 
                        : (session.is_instagram_linked 
                            ? 'Send any Instagram Reel in DM to @reeldex.io. Our AI engine transcribes audio and extracts tools automatically!'
                            : 'Link your Instagram account to automatically sync and transcribe reels you share in Direct Messages!')}
                    </p>

                    {selectedCollection ? (
                      <button onClick={() => setSelectedCollection(null)} className="btn-white" style={{ margin: '0 auto' }}>
                        Browse All Reels
                      </button>
                    ) : session.is_instagram_linked ? (
                      <a href="https://ig.me/m/reeldex.io" target="_blank" rel="noreferrer" className="btn-primary" style={{ margin: '0 auto' }}>
                        <InstagramIcon size={14} /> Open Instagram DM (@reeldex.io)
                      </a>
                    ) : (
                      <button onClick={handleGeneratePairingCode} className="btn-blue" style={{ margin: '0 auto' }}>
                        <InstagramIcon size={14} /> Link Instagram Account
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="ig-reels-grid">
                    {reels.map((reel) => (
                      <div
                        key={reel.id}
                        className="modern-reel-card"
                        onClick={() => { setShowTranslated(false); openReelDetail(reel); }}
                      >
                        {/* Video Thumbnail Box */}
                        {reel.thumbnail_url ? (
                          <div className="modern-card-thumbnail-box">
                            <img src={reel.thumbnail_url} alt={reel.title || 'Reel Thumbnail'} />
                            <div className="modern-card-overlay">
                              <div className="play-circle-badge">
                                <Play size={15} color="#ffffff" style={{ fill: '#ffffff', marginLeft: '2px' }} />
                              </div>
                            </div>

                            {/* Top Floating Badges */}
                            <div style={{ position: 'absolute', top: '10px', left: '10px', right: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span className="pill-category-badge">
                                {reel.category || 'General'}
                              </span>
                              {reel.duration && (
                                <span style={{
                                  background: 'rgba(0, 0, 0, 0.75)',
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
                          </div>
                        ) : (
                          <div style={{ height: '140px', background: '#18181b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Play size={24} color="#ffffff" />
                          </div>
                        )}

                        {/* Card Body with High-End Typography */}
                        <div className="modern-card-body">
                          <div>
                            {/* Author Handle */}
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '600', marginBottom: '4px' }}>
                              @{reel.author || reel.sender_username || 'creator'}
                            </div>

                            {/* Video Title */}
                            <h3 style={{
                              fontSize: '0.96rem',
                              fontWeight: '800',
                              color: 'var(--text-heading)',
                              lineHeight: '1.35',
                              letterSpacing: '-0.01em',
                              marginBottom: '8px',
                              display: '-webkit-box',
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {reel.title || `Reel by @${reel.author || 'Creator'}`}
                            </h3>

                            {/* AI Summary Snippet */}
                            <p style={{
                              fontSize: '0.82rem',
                              color: 'var(--text-body)',
                              lineHeight: '1.55',
                              marginBottom: '6px',
                              display: '-webkit-box',
                              WebkitLineClamp: 3,
                              WebkitBoxOrient: 'vertical',
                              overflow: 'hidden'
                            }}>
                              {formatSummary(reel.summary) || reel.preview_text || 'Transcribing spoken audio...'}
                            </p>
                          </div>

                          {/* Card Footer: Folder Tag, Date & Actions */}
                          <div style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            paddingTop: '10px',
                            borderTop: '1px solid var(--border-light)',
                            fontSize: '0.74rem'
                          }}>
                            <span style={{ color: 'var(--text-muted)', fontWeight: '600' }}>
                              {reel.collection_name ? `📁 ${reel.collection_name}` : (reel.created_at ? new Date(reel.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Saved')}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                              {/* Move to Folder Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenCollectionPickerId(openCollectionPickerId === reel.id ? null : reel.id);
                                }}
                                style={{ background: 'none', border: 'none', color: reel.collection_name ? '#0095f6' : '#94a3b8', cursor: 'pointer', padding: '3px' }}
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
                                    bottom: '26px',
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
                                        className="btn-primary"
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
                                            color: reel.collection_id === col.id ? '#0095f6' : 'var(--text-body)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginBottom: '2px'
                                          }}
                                        >
                                          <Folder size={12} color={reel.collection_id === col.id ? "#0095f6" : "currentColor"} />
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
                                          color: '#0095f6',
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
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: ASK AI COPILOT */}
        {activeTab === 'chat' && (
          <div style={{
            background: 'var(--bg-card)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-light)',
            padding: '24px',
            minHeight: '600px',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid var(--border-light)', paddingBottom: '14px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: 'var(--text-heading)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bot size={20} color="var(--text-heading)" /> Ask AI Copilot
                </h2>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  High-density Grounded Knowledge Search across all your saved Instagram Reels
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
                    background: msg.role === 'user' ? '#ffffff' : '#1c1c1e',
                    color: msg.role === 'user' ? '#000000' : '#f4f4f5',
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
                <div style={{ alignSelf: 'flex-start', padding: '10px 14px', borderRadius: '12px', background: '#1c1c1e', border: '1px solid var(--border-light)', fontSize: '0.82rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Sparkles size={15} color="#0095f6" className="animate-spin" /> Synthesizing answer across your video transcripts...
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
                    padding: '5px 12px',
                    borderRadius: 'var(--radius-full)',
                    background: '#1c1c1e',
                    border: '1px solid var(--border-light)',
                    color: 'var(--text-main)',
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
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border-light)',
                  background: 'var(--bg-input)',
                  color: 'var(--text-main)',
                  outline: 'none',
                  fontSize: '0.88rem'
                }}
              />
              <button type="submit" disabled={chatLoading || !chatQuestion.trim()} className="btn-primary" style={{ padding: '0 20px' }}>
                <Send size={15} />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* ======================================================== */}
      {/* CREATE COLLECTION MODAL */}
      {/* ======================================================== */}
      {showCreateCollectionModal && (
        <div className="modal-overlay" onClick={() => setShowCreateCollectionModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <FolderPlus size={18} color="var(--text-heading)" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: 'var(--text-heading)' }}>New Collection</h3>
              </div>
              <button onClick={() => setShowCreateCollectionModal(false)} className="btn-white" style={{ padding: '4px 8px' }}>✕</button>
            </div>

            <form onSubmit={handleCreateCollection}>
              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: '700', color: 'var(--text-muted)', marginBottom: '6px' }}>
                  COLLECTION NAME
                </label>
                <input
                  type="text"
                  placeholder="e.g. Startup Ideas, Workout, AI Tools..."
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '9px 12px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-input)',
                    color: 'var(--text-main)',
                    fontSize: '0.88rem',
                    outline: 'none'
                  }}
                  autoFocus
                />
              </div>

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreateCollectionModal(false)} className="btn-white">Cancel</button>
                <button type="submit" disabled={!newCollectionName.trim() || creatingCollection} className="btn-primary">
                  {creatingCollection ? 'Creating...' : 'Create'}
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
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <InstagramIcon size={24} color="var(--text-heading)" />
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: 'var(--text-heading)' }}>Link Your Instagram</h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sync reels via Instagram DM in 10 seconds</p>
                </div>
              </div>
              <button onClick={() => setShowPairModal(false)} className="btn-white" style={{ padding: '4px 8px' }}>✕</button>
            </div>

            <div style={{ background: '#1c1c1e', border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '20px', textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: '700', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Your Unique Linking Code
              </span>
              <div style={{ fontSize: '2rem', fontWeight: '900', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em', color: '#ffffff', margin: '6px 0' }}>
                {pairingCode || 'MIND-849201'}
              </div>
              <button onClick={() => copyText(pairingCode)} className="btn-white" style={{ fontSize: '0.78rem' }}>
                {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />} Copy Code
              </button>
            </div>

            <div style={{ fontSize: '0.84rem', color: 'var(--text-main)', lineHeight: '1.6', marginBottom: '20px' }}>
              <ol style={{ paddingLeft: '18px' }}>
                <li>Open Instagram Direct and message <strong>@reeldex.io</strong>.</li>
                <li>Send your code: <code style={{ color: '#38bdf8', background: '#18181b', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>{pairingCode}</code></li>
                <li>Done! Any Reel you share in DM will automatically transcribe and save here.</li>
              </ol>
            </div>

            <a
              href="https://ig.me/m/reeldex.io"
              target="_blank"
              rel="noreferrer"
              className="btn-blue"
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
                  <span className="pill-category-badge">
                    {selectedReel.category || 'General'}
                  </span>
                  {selectedReel.collection_name && (
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#0095f6', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      📁 {selectedReel.collection_name}
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
                backgroundColor: '#000000'
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
                      background: 'linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, transparent 60%)',
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
                      background: 'rgba(0, 0, 0, 0.8)',
                      backdropFilter: 'blur(8px)',
                      border: '1px solid rgba(255, 255, 255, 0.2)',
                      color: '#ffffff',
                      fontWeight: '700',
                      fontSize: '0.8rem',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.5)'
                    }}>
                      <Play size={13} color="#ffffff" style={{ fill: '#ffffff' }} /> Play on Instagram <ExternalLink size={11} />
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
              background: '#1c1c1e',
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
                    background: 'var(--bg-input)',
                    fontWeight: '600',
                    color: 'var(--text-main)',
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
                        background: showTranslated ? 'rgba(0, 149, 246, 0.15)' : '#18181b',
                        borderColor: showTranslated ? '#0095f6' : 'var(--border-light)',
                        color: showTranslated ? '#0095f6' : '#f4f4f5',
                        fontWeight: '700'
                      }}
                    >
                      <Globe size={13} color={showTranslated ? "#0095f6" : "#ffffff"} />
                      {showTranslated ? 'Viewing English Translation' : 'Translate to English'}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleTranslateReel(selectedReel.id)}
                      disabled={translating}
                      className="btn-white"
                      style={{ fontSize: '0.76rem', padding: '4px 10px', color: '#ffffff', fontWeight: '700' }}
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
                background: 'rgba(0, 149, 246, 0.12)',
                border: '1px solid rgba(0, 149, 246, 0.3)',
                borderRadius: '8px',
                padding: '7px 12px',
                fontSize: '0.76rem',
                color: '#0095f6',
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
                background: '#18181b',
                border: '1px solid var(--border-light)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: '800', color: 'var(--text-heading)', marginBottom: '8px' }}>
                  <Sparkles size={14} color="#0095f6" /> AI SUMMARY & KEY TAKEAWAYS
                </div>

                {selectedReel.transcript?.summary && (
                  <p style={{ fontSize: '0.88rem', color: 'var(--text-main)', lineHeight: '1.6', marginBottom: (selectedReel.transcript.key_points?.length || selectedReel.action_items?.length) ? '10px' : '0' }}>
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
                      borderTop: '1px solid var(--border-light)'
                    }}>
                      <div style={{ fontSize: '0.72rem', fontWeight: '800', color: 'var(--text-heading)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '4px' }}>
                        🛠️ Extracted Tools & Action Steps:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {validActions.map((act, i) => (
                          <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>
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
                  <span style={{ fontSize: '0.7rem', color: '#0095f6', fontWeight: '700' }}>
                    ENGLISH TRANSLATION
                  </span>
                )}
              </div>
              <div style={{
                maxHeight: '220px',
                overflowY: 'auto',
                padding: '14px',
                borderRadius: 'var(--radius-sm)',
                background: '#18181b',
                border: '1px solid var(--border-light)',
                color: 'var(--text-main)',
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
