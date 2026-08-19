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
  Tag,
  Users,
  ChevronRight,
  MoreVertical,
  Grid
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

  // Manage / Multi-Select Mode State (Instagram-native)
  const [isManageMode, setIsManageMode] = useState(false);
  const [selectedReelIds, setSelectedReelIds] = useState(new Set());
  const [showBatchCollectionModal, setShowBatchCollectionModal] = useState(false);
  const [batchActionLoading, setBatchActionLoading] = useState(false);

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

  // Collection Detail View & Options State (Instagram Native)
  const [showCollectionMenuModal, setShowCollectionMenuModal] = useState(false);
  const [showEditCollectionModal, setShowEditCollectionModal] = useState(false);
  const [editCollectionName, setEditCollectionName] = useState('');
  const [editingCollection, setEditingCollection] = useState(false);
  const [showAddToThisCollectionModal, setShowAddToThisCollectionModal] = useState(false);
  const [allVaultReels, setAllVaultReels] = useState([]);
  const [selectedReelIdsForAdd, setSelectedReelIdsForAdd] = useState(new Set());
  const [addingReelsToCol, setAddingReelsToCol] = useState(false);
  const [collectionSubTab, setCollectionSubTab] = useState('all'); // 'all' | 'reels'

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
        // Automatically open "Add from saved" picker!
        await fetchAllVaultReels();
        setSelectedReelIdsForAdd(new Set());
        setShowAddToThisCollectionModal(true);
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

  const fetchAllVaultReels = async () => {
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/reels?token=${token}&category=All`);
      if (res.ok) {
        const data = await res.json();
        setAllVaultReels(data || []);
        // Pre-select reels already in this collection
        if (selectedCollection) {
          const currentIds = new Set(
            (data || [])
              .filter(r => String(r.collection_id) === String(selectedCollection.id))
              .map(r => r.id)
          );
          setSelectedReelIdsForAdd(currentIds);
        }
      }
    } catch (e) {
      console.error('Error fetching vault reels:', e);
    }
  };

  const handleSaveEditedCollectionName = async (e) => {
    if (e) e.preventDefault();
    if (!editCollectionName.trim() || editingCollection || !selectedCollection) return;
    setEditingCollection(true);
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/collections/${selectedCollection.id}?token=${token}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editCollectionName.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedCollection(prev => ({ ...prev, name: data.name }));
        setShowEditCollectionModal(false);
        fetchCollections(token);
      }
    } catch (err) {
      console.error('Error editing collection:', err);
    } finally {
      setEditingCollection(false);
    }
  };

  const handleAddReelsToCurrentCollection = async () => {
    if (!selectedCollection || addingReelsToCol) return;
    setAddingReelsToCol(true);
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/reels/batch/assign?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reel_ids: Array.from(selectedReelIdsForAdd),
          collection_id: selectedCollection.id
        })
      });
      if (res.ok) {
        setShowAddToThisCollectionModal(false);
        setSelectedReelIdsForAdd(new Set());
        fetchReels();
        fetchCollections(token);
      }
    } catch (err) {
      console.error('Error adding reels to collection:', err);
    } finally {
      setAddingReelsToCol(false);
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

  // Manage / Batch Operations Handlers
  const toggleSelectReel = (reelId, e) => {
    if (e) e.stopPropagation();
    setSelectedReelIds(prev => {
      const next = new Set(prev);
      if (next.has(reelId)) next.delete(reelId);
      else next.add(reelId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedReelIds.size === reels.length) {
      setSelectedReelIds(new Set());
    } else {
      setSelectedReelIds(new Set(reels.map(r => r.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedReelIds.size === 0) return;
    if (!window.confirm(`Unsave and remove ${selectedReelIds.size} selected reel(s)?`)) return;
    setBatchActionLoading(true);
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const ids = Array.from(selectedReelIds);
      const res = await fetch(`${API_BASE}/reels/batch/delete?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reel_ids: ids })
      });
      if (res.ok) {
        setReels(prev => prev.filter(r => !selectedReelIds.has(r.id)));
        setSelectedReelIds(new Set());
        setIsManageMode(false);
      }
    } catch (err) {
      console.error('Batch delete error:', err);
    } finally {
      setBatchActionLoading(false);
    }
  };

  const handleBatchAssign = async (collectionId) => {
    if (selectedReelIds.size === 0) return;
    setBatchActionLoading(true);
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const ids = Array.from(selectedReelIds);
      const res = await fetch(`${API_BASE}/reels/batch/assign?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reel_ids: ids, collection_id: collectionId })
      });
      if (res.ok) {
        const targetCollection = collections.find(c => c.id === collectionId);
        setReels(prev => prev.map(r => {
          if (selectedReelIds.has(r.id)) {
            return {
              ...r,
              collection_id: collectionId,
              collection_name: targetCollection ? targetCollection.name : null
            };
          }
          return r;
        }));
        fetchCollections();
        setShowBatchCollectionModal(false);
        setSelectedReelIds(new Set());
        setIsManageMode(false);
      }
    } catch (err) {
      console.error('Batch assign error:', err);
    } finally {
      setBatchActionLoading(false);
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

  // Find cover thumbnail for collection
  const getCollectionCover = (collectionId) => {
    // 1. Direct collection thumbnail from API
    const col = collections.find(c => String(c.id) === String(collectionId));
    if (col?.cover_thumbnail) return col.cover_thumbnail;
    if (col?.thumbnails && col.thumbnails.length > 0) return col.thumbnails[0];

    // 2. Search loaded reels state with type-safe string comparison
    const matchingReel = reels.find(r => String(r.collection_id) === String(collectionId) && (r.thumbnail_url || r.shortcode));
    if (matchingReel?.thumbnail_url) return matchingReel.thumbnail_url;
    if (matchingReel?.shortcode) return `https://www.instagram.com/p/${matchingReel.shortcode}/media/?size=l`;

    return null;
  };

  const getCollectionThumbnails = (collectionId) => {
    const col = collections.find(c => String(c.id) === String(collectionId));
    if (col?.thumbnails && col.thumbnails.length > 0) return col.thumbnails;

    const reelThumbs = reels
      .filter(r => String(r.collection_id) === String(collectionId))
      .map(r => r.thumbnail_url || (r.shortcode ? `https://www.instagram.com/p/${r.shortcode}/media/?size=l` : null))
      .filter(Boolean)
      .slice(0, 4);

    return reelThumbs;
  };

  return (
    <div className="ig-app-wrapper">
      {/* ======================================================== */}
      {/* INSTAGRAM-STYLE STICKY TOP NAVBAR */}
      {/* ======================================================== */}
      {isManageMode ? (
        <header className="ig-top-navbar ig-manage-navbar" style={{ background: 'rgba(0, 0, 0, 0.95)', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => { setIsManageMode(false); setSelectedReelIds(new Set()); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff', padding: '4px', display: 'flex', alignItems: 'center' }}
              title="Cancel"
            >
              <X size={24} strokeWidth={2.2} />
            </button>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ffffff', letterSpacing: '-0.02em' }}>
              {selectedReelIds.size > 0 ? `${selectedReelIds.size} selected` : 'All Posts'}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleSelectAll}
              className="ig-filter-pill"
              style={{ fontSize: '0.82rem', fontWeight: '700', padding: '6px 14px' }}
            >
              {selectedReelIds.size === reels.length ? 'Deselect all' : 'Select all'}
            </button>
          </div>
        </header>
      ) : selectedCollection ? (
        <header className="ig-top-navbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <button
              onClick={() => setSelectedCollection(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#ffffff', padding: '2px' }}
              title="Back"
            >
              <ArrowLeft size={24} strokeWidth={2.2} />
            </button>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#ffffff', letterSpacing: '-0.02em', margin: 0 }}>
              {selectedCollection.name}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowCollectionMenuModal(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff', padding: '4px', display: 'flex', alignItems: 'center' }}
              title="Collection Options"
            >
              <MoreVertical size={24} strokeWidth={2.2} />
            </button>
          </div>
        </header>
      ) : (
        <header className="ig-top-navbar">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '900', color: 'var(--text-heading)', letterSpacing: '-0.03em', fontFamily: 'var(--font-main)' }}>
              ReelDex
            </h1>
          </div>

          {/* Center: Search Box */}
          <div className="ig-navbar-search" style={{ flex: 1, maxWidth: '420px', margin: '0 16px' }}>
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
              className="ig-filter-pill ig-user-pill"
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
                padding: '2px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: '4px'
              }}
              title="Create New Collection"
            >
              <Plus size={28} strokeWidth={2.4} />
            </button>
          </div>
        </header>
      )}

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ======================================================== */}
      <div className="ig-content-container" style={{ paddingBottom: isManageMode ? '100px' : '60px' }}>

        {/* Filter Pills (Instagram Horizontal Scrollable Strip) */}
        {activeTab === 'vault' && !selectedCollection && !isManageMode && (
          <div className="ig-categories-strip">
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
            {(!selectedCollection && !isManageMode && (activeViewFilter === 'All' || activeViewFilter === 'Collections')) && (
              <div style={{ marginBottom: '28px' }}>
                {activeViewFilter === 'All' && (
                  <div className="ig-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '0.98rem', fontWeight: '500', color: '#ffffff' }}>
                      Collections
                    </h2>
                    <button
                      onClick={() => setActiveViewFilter('Collections')}
                      style={{ background: 'none', border: 'none', color: '#90a4f2', fontWeight: '600', fontSize: '0.88rem', cursor: 'pointer' }}
                    >
                      See all
                    </button>
                  </div>
                )}

                {collections.length === 0 ? (
                  <div style={{
                    padding: '24px 20px',
                    borderRadius: '14px',
                    background: '#1c1c1e',
                    border: '1px solid var(--border-light)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    margin: '0 16px'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#ffffff' }}>Organize with Collections</div>
                      <div style={{ fontSize: '0.78rem', color: '#8e8e8e', marginTop: '2px' }}>Group your saved reels by theme, work, or project.</div>
                    </div>
                    <button onClick={() => setShowCreateCollectionModal(true)} className="btn-coral" style={{ fontSize: '0.78rem' }}>
                      <Plus size={13} /> Create
                    </button>
                  </div>
                ) : activeViewFilter === 'All' ? (
                  <div className="ig-collections-shelf">
                    {collections.slice(0, 4).map(col => {
                      const coverImg = getCollectionCover(col.id);
                      return (
                        <div
                          key={col.id}
                          className="ig-shelf-card"
                          onClick={() => setSelectedCollection(col)}
                        >
                          <div className="ig-shelf-cover">
                            {coverImg ? (
                              <img src={coverImg} alt={col.name} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#141820' }}>
                                <Folder size={20} color="#8e8e8e" />
                              </div>
                            )}
                          </div>
                          <div className="ig-shelf-info">
                            <div className="ig-shelf-title">
                              {col.name}
                            </div>
                            <div className="ig-shelf-meta">
                              <Lock size={10} /> <span>Private</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="ig-collections-grid">
                    {collections.map(col => {
                      const thumbs = getCollectionThumbnails(col.id);
                      return (
                        <div
                          key={col.id}
                          className="ig-collection-card"
                          onClick={() => setSelectedCollection(col)}
                        >
                          <div className="ig-collection-cover-square">
                            {thumbs.length >= 4 ? (
                              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', width: '100%', height: '100%', gap: '1px' }}>
                                {thumbs.map((img, idx) => (
                                  <img key={idx} src={img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ))}
                              </div>
                            ) : thumbs.length > 0 ? (
                              <img src={thumbs[0]} alt={col.name} />
                            ) : (
                              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c1c1e' }}>
                                <Folder size={32} color="#71717a" />
                              </div>
                            )}
                          </div>
                          <div className="ig-collection-title-block">
                            <div className="ig-collection-title-text">
                              {col.name}
                            </div>
                            <div className="ig-collection-meta-text">
                              <Lock size={11} /> <span>Private</span>
                            </div>
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
                {!isManageMode && selectedCollection && (
                  <div style={{
                    display: 'flex',
                    justifyContent: 'center',
                    gap: '80px',
                    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                    marginBottom: '16px',
                    marginTop: '-4px'
                  }}>
                    <button
                      onClick={() => setCollectionSubTab('all')}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: collectionSubTab === 'all' ? '#ffffff' : '#71717a',
                        padding: '10px 16px',
                        borderBottom: collectionSubTab === 'all' ? '2px solid #ffffff' : '2px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Posts"
                    >
                      <Grid size={22} strokeWidth={collectionSubTab === 'all' ? 2.4 : 1.8} />
                    </button>
                    <button
                      onClick={() => setCollectionSubTab('reels')}
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: collectionSubTab === 'reels' ? '#ffffff' : '#71717a',
                        padding: '10px 16px',
                        borderBottom: collectionSubTab === 'reels' ? '2px solid #ffffff' : '2px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}
                      title="Reels"
                    >
                      <Play size={22} strokeWidth={collectionSubTab === 'reels' ? 2.4 : 1.8} />
                    </button>
                  </div>
                )}

                {!isManageMode && !selectedCollection && (
                  <div className="ig-reels-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '0.98rem', fontWeight: '500', color: '#ffffff' }}>
                      Reels and posts
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {reels.length > 0 && (
                        <button
                          onClick={() => setIsManageMode(true)}
                          style={{ background: 'none', border: 'none', color: '#90a4f2', fontWeight: '600', fontSize: '0.88rem', cursor: 'pointer' }}
                        >
                          Manage
                        </button>
                      )}
                    </div>
                  </div>
                )}

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
                      <button
                        onClick={async () => {
                          await fetchAllVaultReels();
                          setShowAddToThisCollectionModal(true);
                        }}
                        className="btn-primary"
                        style={{ margin: '0 auto', gap: '6px' }}
                      >
                        <Plus size={15} /> Add reels to this collection
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
                        onClick={(e) => {
                          if (isManageMode) {
                            toggleSelectReel(reel.id, e);
                          } else {
                            setShowTranslated(false);
                            openReelDetail(reel);
                          }
                        }}
                        style={{
                          opacity: (isManageMode && selectedReelIds.size > 0 && !selectedReelIds.has(reel.id)) ? 0.5 : 1,
                          position: 'relative',
                          cursor: 'pointer'
                        }}
                      >
                        {/* Video Thumbnail Box */}
                        {reel.thumbnail_url ? (
                          <div className="modern-card-thumbnail-box">
                            <img src={reel.thumbnail_url} alt={reel.title || 'Reel Thumbnail'} />
                            
                            {/* Instagram 3-Grid Top-Right Reel Icon */}
                            <div className="ig-reel-media-badge">
                              <Play size={13} color="#ffffff" fill="#ffffff" />
                            </div>

                            <div className="modern-card-overlay">
                              {!isManageMode && (
                                <div className="play-circle-badge">
                                  <Play size={15} color="#ffffff" style={{ fill: '#ffffff', marginLeft: '2px' }} />
                                </div>
                              )}
                            </div>

                            {/* Top Floating Badges (Desktop) */}
                            <div className="modern-card-badges">
                              <span className="pill-category-badge">
                                {reel.category || 'General'}
                              </span>
                              {reel.duration && (
                                <span className="pill-duration-badge">
                                  {Math.round(reel.duration)}s
                                </span>
                              )}
                            </div>

                            {/* Manage Mode Multi-Select Checkbox Overlay (Instagram Native) */}
                            {isManageMode && (
                              <div style={{
                                position: 'absolute',
                                bottom: '10px',
                                right: '10px',
                                width: '24px',
                                height: '24px',
                                borderRadius: '4px',
                                background: selectedReelIds.has(reel.id) ? '#ffffff' : 'rgba(0, 0, 0, 0.65)',
                                border: selectedReelIds.has(reel.id) ? '2px solid #ffffff' : '2px solid rgba(255, 255, 255, 0.7)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                zIndex: 10,
                                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.6)'
                              }}>
                                {selectedReelIds.has(reel.id) && <Check size={16} color="#000000" strokeWidth={3.5} />}
                              </div>
                            )}
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
                            <span style={{ color: 'var(--text-muted)', fontWeight: '600', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                              {reel.collection_name ? (
                                <>
                                  <Folder size={12} color="#90a4f2" strokeWidth={2.2} />
                                  <span style={{ color: '#90a4f2' }}>{reel.collection_name}</span>
                                </>
                              ) : (
                                reel.created_at ? new Date(reel.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : 'Saved'
                              )}
                            </span>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', position: 'relative' }}>
                              {/* Move to Folder Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenCollectionPickerId(openCollectionPickerId === reel.id ? null : reel.id);
                                }}
                                style={{ background: 'none', border: 'none', color: reel.collection_name ? '#90a4f2' : '#94a3b8', cursor: 'pointer', padding: '3px' }}
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
                                    background: 'var(--bg-card)',
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
                                            color: reel.collection_id === col.id ? '#90a4f2' : 'var(--text-body)',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            marginBottom: '2px'
                                          }}
                                        >
                                          <Folder size={12} color={reel.collection_id === col.id ? "#90a4f2" : "currentColor"} />
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
                                          color: '#90a4f2',
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
                  <Sparkles size={15} color="#90a4f2" className="animate-spin" /> Synthesizing answer across your video transcripts...
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
      {/* MANAGE MODE STICKY BOTTOM ACTION BAR (Instagram Native) */}
      {/* ======================================================== */}
      {isManageMode && (
        <div className="ig-manage-bottom-bar">
          {/* Unsave Button */}
          <button
            onClick={handleBatchDelete}
            disabled={selectedReelIds.size === 0 || batchActionLoading}
            className="ig-manage-bottom-btn"
            style={{ color: selectedReelIds.size > 0 ? '#ef4444' : '#71717a' }}
          >
            Unsave
          </button>

          {/* Add to Collection Button */}
          <button
            onClick={() => setShowBatchCollectionModal(true)}
            disabled={selectedReelIds.size === 0 || batchActionLoading}
            className="ig-manage-bottom-btn"
            style={{ color: selectedReelIds.size > 0 ? '#ffffff' : '#71717a' }}
          >
            Add to collection
          </button>
        </div>
      )}

      {/* ======================================================== */}
      {/* BATCH ADD TO COLLECTION BOTTOM SHEET (Exact Instagram Native Layout) */}
      {/* ======================================================== */}
      {showBatchCollectionModal && (
        <div className="modal-overlay" onClick={() => setShowBatchCollectionModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', padding: '16px 18px 28px', background: '#141820', borderRadius: '18px' }}>
            {/* Top Drag Handle */}
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 16px' }} />
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#ffffff', margin: 0 }}>
                Add to collection
              </h3>
              <button
                onClick={() => { setShowBatchCollectionModal(false); setShowCreateCollectionModal(true); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ffffff', padding: '4px', display: 'flex', alignItems: 'center' }}
                title="Create New Collection"
              >
                <Plus size={26} strokeWidth={2.4} />
              </button>
            </div>

            {collections.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  No collections yet. Create your first collection to group these reels!
                </p>
                <button
                  onClick={() => { setShowBatchCollectionModal(false); setShowCreateCollectionModal(true); }}
                  className="btn-primary"
                >
                  <Plus size={14} /> Create New Collection
                </button>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                gap: '14px',
                overflowX: 'auto',
                padding: '4px 2px 12px',
                scrollbarWidth: 'none'
              }}>
                {collections.map(col => {
                  const coverImg = getCollectionCover(col.id);
                  return (
                    <div
                      key={col.id}
                      onClick={() => handleBatchAssign(col.id)}
                      style={{
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        width: '74px',
                        minWidth: '74px',
                        gap: '8px',
                        textAlign: 'center'
                      }}
                    >
                      <div style={{
                        width: '74px',
                        height: '74px',
                        borderRadius: '12px',
                        overflow: 'hidden',
                        background: '#1c212c',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                      }}>
                        {coverImg ? (
                          <img src={coverImg} alt={col.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1c212c' }}>
                            <Folder size={26} color="#8e8e8e" />
                          </div>
                        )}
                      </div>
                      <div style={{
                        fontSize: '0.84rem',
                        fontWeight: '500',
                        color: '#ffffff',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        width: '100%'
                      }}>
                        {col.name}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* CREATE COLLECTION MODAL (Exact Instagram Native Bottom Sheet) */}
      {/* ======================================================== */}
      {showCreateCollectionModal && (
        <div className="modal-overlay" onClick={() => setShowCreateCollectionModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '16px 20px 24px' }}>
            {/* Top Handle Bar */}
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 16px' }} />

            {/* Header: Cancel | New collection | Next */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <button
                type="button"
                onClick={() => { setShowCreateCollectionModal(false); setNewCollectionName(''); }}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.96rem', fontWeight: '500', cursor: 'pointer', padding: 0 }}
              >
                Cancel
              </button>

              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#ffffff', margin: 0, textAlign: 'center' }}>
                New collection
              </h3>

              <button
                type="button"
                onClick={handleCreateCollection}
                disabled={!newCollectionName.trim() || creatingCollection}
                style={{
                  background: 'none',
                  border: 'none',
                  color: newCollectionName.trim() ? '#90a4f2' : '#52525b',
                  fontSize: '0.96rem',
                  fontWeight: '700',
                  cursor: newCollectionName.trim() ? 'pointer' : 'not-allowed',
                  padding: 0
                }}
              >
                {creatingCollection ? 'Adding...' : 'Next'}
              </button>
            </div>

            <form onSubmit={handleCreateCollection}>
              {/* Collection Name Input Box */}
              <div style={{ marginBottom: '18px' }}>
                <input
                  type="text"
                  placeholder="Collection name"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '16px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #3f3f46',
                    background: '#09090b',
                    color: '#ffffff',
                    fontSize: '0.95rem',
                    outline: 'none',
                    boxSizing: 'border-box'
                  }}
                  autoFocus
                />
              </div>

              {/* Add people to this collection option row */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 4px',
                cursor: 'pointer'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <Users size={22} color="#ffffff" />
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#ffffff' }}>
                      Add people to this collection
                    </div>
                    <div style={{ fontSize: '0.76rem', color: '#8e8e8e', marginTop: '2px' }}>
                      Save to a collection together
                    </div>
                  </div>
                </div>
                <ChevronRight size={18} color="#71717a" />
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* COLLECTION 3-DOTS OPTIONS BOTTOM SHEET (Exact Instagram Native Layout) */}
      {/* ======================================================== */}
      {showCollectionMenuModal && selectedCollection && (
        <div className="modal-overlay" onClick={() => setShowCollectionMenuModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '14px 20px 24px', background: '#141820', borderRadius: '18px 18px 0 0' }}>
            {/* Top drag handle */}
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {/* 1. Delete Collection (Red) */}
              <button
                onClick={(e) => {
                  setShowCollectionMenuModal(false);
                  handleDeleteCollection(selectedCollection.id, e);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                  color: '#ed4956',
                  fontSize: '0.96rem',
                  fontWeight: '600',
                  padding: '16px 0',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                Delete Collection
              </button>

              {/* 2. Edit collection */}
              <button
                onClick={() => {
                  setShowCollectionMenuModal(false);
                  setEditCollectionName(selectedCollection.name);
                  setShowEditCollectionModal(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                  color: '#ffffff',
                  fontSize: '0.96rem',
                  fontWeight: '500',
                  padding: '16px 0',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                Edit collection
              </button>

              {/* 3. Add to collection */}
              <button
                onClick={async () => {
                  setShowCollectionMenuModal(false);
                  await fetchAllVaultReels();
                  setShowAddToThisCollectionModal(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: '1px solid rgba(255, 255, 255, 0.07)',
                  color: '#ffffff',
                  fontSize: '0.96rem',
                  fontWeight: '500',
                  padding: '16px 0',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                Add to collection
              </button>

              {/* 4. Select... */}
              <button
                onClick={() => {
                  setShowCollectionMenuModal(false);
                  setIsManageMode(true);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#ffffff',
                  fontSize: '0.96rem',
                  fontWeight: '500',
                  padding: '16px 0 6px',
                  textAlign: 'left',
                  cursor: 'pointer'
                }}
              >
                Select...
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* EDIT COLLECTION MODAL */}
      {/* ======================================================== */}
      {showEditCollectionModal && selectedCollection && (
        <div className="modal-overlay" onClick={() => setShowEditCollectionModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '16px 20px 24px', background: '#141820', borderRadius: '18px' }}>
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <button
                type="button"
                onClick={() => setShowEditCollectionModal(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', fontSize: '0.96rem', fontWeight: '500', cursor: 'pointer', padding: 0 }}
              >
                Cancel
              </button>

              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#ffffff', margin: 0, textAlign: 'center' }}>
                Edit collection
              </h3>

              <button
                type="button"
                onClick={handleSaveEditedCollectionName}
                disabled={!editCollectionName.trim() || editingCollection}
                style={{
                  background: 'none',
                  border: 'none',
                  color: editCollectionName.trim() ? '#90a4f2' : '#52525b',
                  fontSize: '0.96rem',
                  fontWeight: '700',
                  cursor: editCollectionName.trim() ? 'pointer' : 'not-allowed',
                  padding: 0
                }}
              >
                {editingCollection ? 'Saving...' : 'Done'}
              </button>
            </div>

            <form onSubmit={handleSaveEditedCollectionName}>
              <input
                type="text"
                value={editCollectionName}
                onChange={(e) => setEditCollectionName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '16px 14px',
                  borderRadius: '12px',
                  border: '1.5px solid #3f3f46',
                  background: '#09090b',
                  color: '#ffffff',
                  fontSize: '0.95rem',
                  outline: 'none',
                  boxSizing: 'border-box'
                }}
                autoFocus
              />
            </form>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* ADD FROM SAVED PICKER MODAL (Exact Instagram Screenshot 2) */}
      {/* ======================================================== */}
      {showAddToThisCollectionModal && selectedCollection && (
        <div className="modal-overlay" onClick={() => setShowAddToThisCollectionModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '14px 14px 20px', background: '#141820', borderRadius: '18px 18px 0 0' }}>
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 14px' }} />

            {/* Header: Back Arrow | Add from saved | Save */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' }}>
              <button
                type="button"
                onClick={() => setShowAddToThisCollectionModal(false)}
                style={{ background: 'none', border: 'none', color: '#ffffff', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px' }}
                title="Back"
              >
                <ArrowLeft size={22} strokeWidth={2.2} />
              </button>

              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#ffffff', margin: 0, textAlign: 'center' }}>
                Add from saved
              </h3>

              <button
                type="button"
                onClick={handleAddReelsToCurrentCollection}
                disabled={addingReelsToCol}
                style={{
                  background: 'none',
                  border: 'none',
                  color: selectedReelIdsForAdd.size > 0 ? '#90a4f2' : '#ffffff',
                  fontSize: '0.96rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                  padding: '4px 6px'
                }}
              >
                {addingReelsToCol ? 'Saving...' : 'Save'}
              </button>
            </div>

            {/* Scrollable 3-Column Square Grid with Top-Left Checkboxes */}
            <div style={{ flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', padding: '1px' }}>
              {allVaultReels.map(reel => {
                const isSelected = selectedReelIdsForAdd.has(reel.id);
                return (
                  <div
                    key={reel.id}
                    onClick={() => {
                      setSelectedReelIdsForAdd(prev => {
                        const next = new Set(prev);
                        if (next.has(reel.id)) next.delete(reel.id);
                        else next.add(reel.id);
                        return next;
                      });
                    }}
                    style={{
                      position: 'relative',
                      aspectRatio: '1 / 1',
                      background: '#1c1c1e',
                      cursor: 'pointer',
                      overflow: 'hidden'
                    }}
                  >
                    {reel.thumbnail_url ? (
                      <img src={reel.thumbnail_url} alt={reel.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#27272a' }}>
                        <Play size={24} color="#71717a" />
                      </div>
                    )}
                    {/* Checkbox in Top-Left Corner (Exact Screenshot 2) */}
                    <div style={{
                      position: 'absolute',
                      top: '8px',
                      left: '8px',
                      width: '20px',
                      height: '20px',
                      borderRadius: '3px',
                      background: isSelected ? '#ffffff' : 'rgba(0, 0, 0, 0.4)',
                      border: isSelected ? '1.5px solid #ffffff' : '1.5px solid rgba(255, 255, 255, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 5
                    }}>
                      {isSelected && <Check size={13} color="#000000" strokeWidth={3} />}
                    </div>
                  </div>
                );
              })}
            </div>
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
                    <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#90a4f2', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <Folder size={12} color="#90a4f2" strokeWidth={2.2} />
                      <span>{selectedReel.collection_name}</span>
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
                        background: showTranslated ? 'rgba(144, 164, 242, 0.15)' : 'var(--bg-card)',
                        borderColor: showTranslated ? '#90a4f2' : 'var(--border-light)',
                        color: showTranslated ? '#90a4f2' : '#f4f4f5',
                        fontWeight: '700'
                      }}
                    >
                      <Globe size={13} color={showTranslated ? "#90a4f2" : "#ffffff"} />
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
                color: '#90a4f2',
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
                  <Sparkles size={14} color="#90a4f2" /> AI SUMMARY & KEY TAKEAWAYS
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
                  <span style={{ fontSize: '0.7rem', color: '#90a4f2', fontWeight: '700' }}>
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
