import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  ChevronDown,
  MoreVertical,
  Grid,
  User,
  RotateCw,
  Command as CommandIcon,
  MessageSquare
} from 'lucide-react';
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";

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

const isInstagramUrl = (url) => {
  if (!url || typeof url !== 'string') return false;
  return /instagram\.com|instagr\.am|ig\.me/i.test(url);
};

const openInstagramUrl = (rawUrl, e) => {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
    e.stopPropagation();
  }
  if (!rawUrl) return;

  const isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent || '');

  // Handle direct DM link
  if (rawUrl.includes('ig.me') || rawUrl.includes('/m/')) {
    if (isAndroid) {
      window.location.href = 'intent://instagram.com/_u/reeldex.io/#Intent;package=com.instagram.android;scheme=https;end';
      return;
    }
    if (isIOS) {
      window.location.href = 'instagram://user?username=reeldex.io';
      setTimeout(() => {
        window.location.href = 'https://ig.me/m/reeldex.io';
      }, 1200);
      return;
    }
    window.open(rawUrl, '_blank', 'noopener,noreferrer');
    return;
  }

  // Extract shortcode if present: /reel/SHORTCODE/ or /p/SHORTCODE/
  const match = rawUrl.match(/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i);
  const shortcode = match ? match[1] : null;

  if (isAndroid) {
    if (shortcode) {
      // Android Chrome Intent: Opens native Instagram app directly to the Reel
      window.location.href = `intent://instagram.com/reel/${shortcode}/#Intent;package=com.instagram.android;scheme=https;end`;
      return;
    }
    const cleanPath = rawUrl.replace(/^https?:\/\/(?:www\.)?instagram\.com\//i, '');
    window.location.href = `intent://instagram.com/${cleanPath}#Intent;package=com.instagram.android;scheme=https;end`;
    return;
  }

  if (isIOS) {
    if (shortcode) {
      // iOS app deep link with graceful fallback
      window.location.href = `instagram://reel?shortcode=${shortcode}`;
      setTimeout(() => {
        window.location.href = `https://www.instagram.com/reel/${shortcode}/`;
      }, 1200);
      return;
    }
    window.location.href = rawUrl;
    return;
  }

  // Desktop / other: open standard web link in new tab
  window.open(rawUrl, '_blank', 'noopener,noreferrer');
};

const renderWithClickableLinks = (text) => {
  if (!text) return '';
  const str = typeof text === 'string' ? text : formatSummary(text);
  if (!str) return '';

  const urlRegex = /(https?:\/\/[^\s,)]+|(?:[a-zA-Z0-9-]+\.)+(?:com|dev|ai|io|net|org|app|co|xyz|so|me|tech|site|online|space|store|design|tools|club|live|pro|agency|studio)(?:\/[^\s,)]*)?)/gi;
  
  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(str)) !== null) {
    if (match.index > lastIndex) {
      elements.push(str.substring(lastIndex, match.index));
    }
    const rawUrl = match[1];
    const cleanUrl = rawUrl.replace(/[.,;:)]+$/, '');
    const trailing = rawUrl.substring(cleanUrl.length);
    const href = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://') 
      ? cleanUrl 
      : `https://${cleanUrl}`;

    const isIg = isInstagramUrl(href);

    elements.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (isIg) {
            openInstagramUrl(href, e);
          } else {
            e.stopPropagation();
          }
        }}
        style={{
          color: '#90a4f2',
          textDecoration: 'underline',
          textUnderlineOffset: '3px',
          fontWeight: '500',
          cursor: 'pointer'
        }}
      >
        {cleanUrl}
      </a>
    );

    if (trailing) {
      elements.push(trailing);
    }

    lastIndex = match.index + rawUrl.length;
  }

  if (lastIndex < str.length) {
    elements.push(str.substring(lastIndex));
  }

  return elements.length > 0 ? elements : str;
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
    const serialized = typeof val === 'string' ? val : JSON.stringify(val);
    window.localStorage?.setItem(key, serialized);
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

  const formatSanitizedMarkdown = (text) => {
    if (!text) return '';
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
    if (cleaned.toLowerCase().includes('<think>')) {
      cleaned = cleaned.replace(/<think>[\s\S]*/gi, '');
    }
    // Auto-close unclosed markdown link parentheses if truncated
    return cleaned.replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)\n]+)/g, (match, label, url) => {
      if (!url.endsWith(')')) {
        return `[${label}](${url.replace(/[.;,]+$/, '')})`;
      }
      return match;
    });
  };

const getCachedReels = () => {
    try {
      const raw = getSafeStorage('reelmind_cached_reels');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const getCachedCollections = () => {
    try {
      const raw = getSafeStorage('reelmind_cached_collections');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const getReelThumbnail = (reel) => {
    if (!reel) return null;
    let url = reel.thumbnail_url;
    if (!url && reel.shortcode) {
      url = `/api/thumbnail/${reel.shortcode}`;
    }
    if (url && url.startsWith('/api/')) {
      return `${API_BASE}${url.replace('/api', '')}`;
    }
    return url;
  };

  const handleThumbnailError = (e, shortcode) => {
    const img = e.currentTarget;
    if (shortcode && !img.dataset.retried) {
      img.dataset.retried = '1';
      img.src = `${API_BASE}/thumbnail/${shortcode}`;
    } else if (shortcode && img.dataset.retried === '1') {
      img.dataset.retried = '2';
      img.src = `https://www.instagram.com/reel/${shortcode}/media/?size=l`;
    } else {
      img.style.display = 'none';
      if (img.parentElement) {
        img.parentElement.classList.add('has-fallback-poster');
      }
    }
  };

  // Vault, Collections & Search State (Instant 0ms Cache-First)
  const [reels, setReels] = useState(getCachedReels);
  const [initialLoading, setInitialLoading] = useState(() => getCachedReels().length === 0);
  const [reelsLoading, setReelsLoading] = useState(false);
  const [categories, setCategories] = useState(['All']);
  const [collections, setCollections] = useState(getCachedCollections);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedReel, setSelectedReel] = useState(null);

  // Collection Creator & Popover
  const [showCreateCollectionModal, setShowCreateCollectionModal] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [creatingCollection, setCreatingCollection] = useState(false);
  const [openCollectionPickerId, setOpenCollectionPickerId] = useState(null);
  const [showDetailFolderPicker, setShowDetailFolderPicker] = useState(false);

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
      content: 'I am your **Dex AI Copilot**. Ask me anything across your saved Instagram Reels — like *"Summarize all job interview tips"*, *"List all design & AI tools mentioned"*, or *"Find workout & communication advice"*.'
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef(null);

  // Utility State
  const [copied, setCopied] = useState(false);
  const [copiedMsgIdx, setCopiedMsgIdx] = useState(null);

  // Global ShadCN Command Dialog State (⌘K / Ctrl+K)
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const down = (e) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const hasMoreItemsToShow = (content) => {
    if (!content) return false;
    // Count bullet items (- **, • **, 1. **)
    const bulletCount = (content.match(/(?:[-*•]|\d+\.)\s+\*\*/g) || []).length;
    // Show when response contains 3+ structured bullet points or long multi-item summary
    return bulletCount >= 2 || (content.length > 400 && /(?:[-*•]|\d+\.)\s+/.test(content));
  };

  const handleShowMoreResults = (idx) => {
    // Find the user question that requested this answer
    const previousUserMsg = chatMessages.slice(0, idx + 1).reverse().find(m => m.role === 'user');
    const questionTopic = previousUserMsg?.content ? `"${previousUserMsg.content.trim()}"` : 'my previous question';
    sendChatMessageText(`Show more results for ${questionTopic}: list any remaining items, tips, advice, or resources from my saved reels that were NOT mentioned in your previous answer above.`);
  };

  const formatForWhatsAppAndNotes = (rawMarkdown) => {
    if (!rawMarkdown) return '';

    let text = rawMarkdown.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // 1. Strip incomplete trailing broken link or unclosed bullet title at end
    text = text.replace(/(\n|\s)*[-*•]?\s*(?:\*?Source:\*?\s*)?\[[^\]]*\]?\s*\(?\s*https?:\/\/[^\)\s]*$/gi, '');
    text = text.replace(/(\n|\s)*[-*•]?\s*(?:\*?Source:\*?\s*)?\[[^\]]*$/gi, '');
    text = text.replace(/(\n|\s)*[-*•]?\s*\*\*[^*]+$/gi, '');
    text = text.replace(/(\n|\s)*[-*•]?\s+[^.\n\)\s]+$/gi, '');

    // 2. Normalize headers H1-H4 to WhatsApp bold text (*Header Name*)
    text = text.replace(/^#{1,4}\s+(.+)$/gm, '\n*$1*\n');

    // 3. Convert markdown links [Watch Video](url) into clean direct URLs for WhatsApp & Notes
    text = text.replace(/(?:\*?Source:\*?\s*)?\[([^\]]+)\]\((https?:\/\/[^\s\)\n]+)\)*\s*(?:by|•)?\s*(@\w+)?/gi, (match, label, url, creator) => {
      const cleanUrl = url.replace(/\)+$/, '').trim();
      const cleanCreator = creator ? `(${creator.trim()})` : '';
      return cleanCreator ? `🔗 ${cleanUrl} ${cleanCreator}` : `🔗 ${cleanUrl}`;
    });

    // 4. Convert markdown bold **Text** to WhatsApp bold *Text*
    text = text.replace(/\*\*([^*]+)\*\*/g, '*$1*');

    // 5. Normalize bullet points to clean unicode dots •
    text = text.replace(/^[\s]*[-*+]\s+/gm, '• ');

    // 6. Clean up extra newlines or spaces
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  };

  const formatForMarkdownExport = (rawMarkdown) => {
    if (!rawMarkdown) return '';

    let text = rawMarkdown.replace(/<think>[\s\S]*?<\/think>/gi, '');

    // 1. Strip incomplete trailing broken link or unclosed bullet title at end
    text = text.replace(/(\n|\s)*[-*•]?\s*(?:\*?Source:\*?\s*)?\[[^\]]*\]?\s*\(?\s*https?:\/\/[^\)\s]*$/gi, '');
    text = text.replace(/(\n|\s)*[-*•]?\s*(?:\*?Source:\*?\s*)?\[[^\]]*$/gi, '');
    text = text.replace(/(\n|\s)*[-*•]?\s*\*\*[^*]+$/gi, '');
    text = text.replace(/(\n|\s)*[-*•]?\s+[^.\n\)\s]+$/gi, '');

    // 2. Fix double parentheses and clean markdown links
    text = text.replace(/(?:\*?Source:\*?\s*)?\[([^\]]+)\]\((https?:\/\/[^\s\)\n]+)\)*\s*(?:by|•)?\s*(@\w+)?/gi, (match, label, url, creator) => {
      const cleanUrl = url.replace(/\)+$/, '').trim();
      const cleanCreator = creator ? `by ${creator.trim()}` : '';
      return cleanCreator ? `[Watch Video](${cleanUrl}) ${cleanCreator}` : `[Watch Video](${cleanUrl})`;
    });

    // 3. Clean up extra newlines
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  };

  const handleCopyMessageText = (text, idx, mode = 'whatsapp') => {
    if (!text) return;
    const formatted = mode === 'whatsapp' ? formatForWhatsAppAndNotes(text) : formatForMarkdownExport(text);
    try {
      navigator.clipboard.writeText(formatted);
      setCopiedMsgIdx(`${idx}-${mode}`);
      toast.success(mode === 'whatsapp' ? 'Formatted for WhatsApp & Notes copied!' : 'Markdown copied to clipboard!');
      setTimeout(() => setCopiedMsgIdx(null), 2000);
    } catch (e) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const handleDownloadMessageText = (text, idx) => {
    if (!text) return;
    const formatted = formatForMarkdownExport(text);
    const blob = new Blob([formatted], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dex-ai-summary-${idx}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

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

  // 0ms Instant Client-Side Category, Collection & Search Filter
  const displayedReels = useMemo(() => {
    let list = Array.isArray(reels) ? reels : [];

    // 1. Collection filter
    if (selectedCollection?.id) {
      list = list.filter(r => String(r.collection_id) === String(selectedCollection.id));
    } else if (activeViewFilter && activeViewFilter !== 'All' && activeViewFilter !== 'Collections') {
      // 2. Instant 0ms Category filter
      const catLower = activeViewFilter.toLowerCase().trim();
      list = list.filter(r => (r.category || '').toLowerCase().trim() === catLower);
    }

    // 3. Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => {
        const title = (r.title || '').toLowerCase();
        const author = (r.author || r.sender_username || '').toLowerCase();
        const category = (r.category || '').toLowerCase();
        const summary = (typeof r.summary === 'string' ? r.summary : JSON.stringify(r.summary || '')).toLowerCase();
        const tags = Array.isArray(r.tags) ? r.tags.join(' ').toLowerCase() : '';
        return title.includes(q) || author.includes(q) || category.includes(q) || summary.includes(q) || tags.includes(q);
      });
    }

    return list;
  }, [reels, selectedCollection?.id, activeViewFilter, searchQuery]);

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

    // Fast-track latest reel if opened directly from Instagram DM (?new_reel=123)
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const newReelId = urlParams.get('new_reel');
      if (newReelId) {
        fetch(`${API_BASE}/reels/${newReelId}`)
          .then(res => res.json())
          .then(newReel => {
            if (newReel && newReel.id) {
              setReels(prev => {
                if (prev.some(r => r.id === newReel.id)) return prev;
                const updated = [newReel, ...prev];
                setSafeStorage('reelmind_cached_reels', updated);
                return updated;
              });
            }
          })
          .catch(() => {});
      }
    } catch {}

    fetchCategories();
    fetchCollections(currentToken);
  }, []);

  // 2. Continuous Vault Sync (Instant Local Cache + Background Server Polling)
  useEffect(() => {
    let isCancelled = false;

    const loadData = async () => {
      try {
        const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
        const res = await fetch(`${API_BASE}/reels?token=${token}&category=All`);
        if (res.ok && !isCancelled) {
          const data = await res.json();
          setReels(data || []);
          setSafeStorage('reelmind_cached_reels', JSON.stringify(data || []));
        }
        if (!isCancelled) {
          fetchCollections(token);
        }
      } catch (err) {
        console.error('Error fetching reels:', err);
      } finally {
        if (!isCancelled) {
          setReelsLoading(false);
          setInitialLoading(false);
        }
      }
    };

    loadData();

    // Adaptive Smart Polling:
    // - Active (3.5s) when a reel is in-flight (processing/transcribing)
    // - Relaxed (10s) when all reels are completed
    // - Paused when browser tab is inactive/backgrounded (saves 100% idle server load)
    const hasPendingReels = reels.some(r => ['processing', 'downloading', 'transcribing'].includes(r.status));
    const pollDelay = hasPendingReels ? 3500 : 10000;

    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    }, pollDelay);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadData();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      isCancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [session?.auth_token, reels.some(r => ['processing', 'downloading', 'transcribing'].includes(r.status))]);

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
        setSafeStorage('reelmind_cached_collections', data || []);
      }
    } catch (e) {
      console.error('Error fetching collections:', e);
    }
  };

  const fetchReels = async (overrideToken) => {
    try {
      const token = overrideToken !== undefined ? overrideToken : (session?.auth_token || getSafeStorage('reelmind_token') || '');
      const categoryParam = (activeViewFilter === 'All' || activeViewFilter === 'Collections' || selectedCollection) ? 'All' : activeViewFilter;
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
        setReels(data || []);
      }
    } catch (err) {
      console.error('Error fetching reels:', err);
    } finally {
      setInitialLoading(false);
      setReelsLoading(false);
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
        toast.success(`Created collection "${newCol.name}"`);
        // Instantly transition into "Add from saved" without exposing empty background
        setShowCreateCollectionModal(false);
        setSelectedCollection(newCol);
        setSelectedReelIdsForAdd(new Set());
        setShowAddToThisCollectionModal(true);
        setCollections(prev => {
          const next = [newCol, ...prev.filter(c => c.id !== newCol.id)];
          setSafeStorage('reelmind_cached_collections', next);
          return next;
        });
        // Background fetch data
        fetchAllVaultReels(newCol);
        fetchCollections(token);
      }
    } catch (err) {
      console.error('Error creating collection:', err);
    } finally {
      setCreatingCollection(false);
    }
  };

  const handleDeleteCollection = (collectionId, e) => {
    if (e) {
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      if (typeof e.preventDefault === 'function') e.preventDefault();
    }
    // 1. Instant 0ms Optimistic UI Removal
    setShowCollectionMenuModal(false);
    toast.success('Collection deleted');
    if (selectedCollection?.id === collectionId) {
      setSelectedCollection(null);
    }
    setCollections(prev => {
      const next = prev.filter(c => c.id !== collectionId);
      setSafeStorage('reelmind_cached_collections', next);
      return next;
    });
    // Unset collection_id on local reels immediately
    setReels(prev => {
      const next = prev.map(r => String(r.collection_id) === String(collectionId) ? { ...r, collection_id: null, collection_name: null } : r);
      setSafeStorage('reelmind_cached_reels', next);
      return next;
    });

    // 2. Background server deletion
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      fetch(`${API_BASE}/collections/${collectionId}?token=${token}`, { method: 'DELETE' }).catch(err => {
        console.error('Error deleting collection:', err);
      });
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAllVaultReels = async (targetCollection) => {
    const col = targetCollection !== undefined ? targetCollection : selectedCollection;
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/reels?token=${token}&category=All`);
      if (res.ok) {
        const data = await res.json();
        setAllVaultReels(data || []);
        // Pre-select reels already in this collection
        if (col) {
          const currentIds = new Set(
            (data || [])
              .filter(r => String(r.collection_id) === String(col.id))
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
        setCollections(prev => {
          const next = prev.map(c => c.id === selectedCollection.id ? { ...c, name: data.name } : c);
          setSafeStorage('reelmind_cached_collections', next);
          return next;
        });
        setReels(prev => {
          const next = prev.map(r => String(r.collection_id) === String(selectedCollection.id) ? { ...r, collection_name: data.name } : r);
          setSafeStorage('reelmind_cached_reels', next);
          return next;
        });
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
        toast.success(collectionId ? `Moved to ${data.collection_name || 'collection'}` : 'Removed from collection');
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

  const handleDeleteReel = (reelId, e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    // Instant 0ms Optimistic UI Removal
    setReels(prev => {
      const next = prev.filter(r => r.id !== reelId);
      setSafeStorage('reelmind_cached_reels', next);
      return next;
    });
    if (selectedReel?.id === reelId) {
      setSelectedReel(null);
    }
    toast.success('Reel removed from vault');
    
    // Background server sync
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      fetch(`${API_BASE}/reels/${reelId}?token=${token}`, { method: 'DELETE' }).catch(err => {
        console.error('Error deleting reel:', err);
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleRetryReel = async (reelId, e) => {
    if (e) e.stopPropagation();
    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/reels/${reelId}/retry?token=${token}`, {
        method: 'POST'
      });
      if (res.ok) {
        toast.info('Retrying audio transcription...');
        setReels(prev => prev.map(r => r.id === reelId ? { ...r, status: 'processing', error_message: null } : r));
        if (selectedReel?.id === reelId) {
          setSelectedReel(prev => prev ? { ...prev, status: 'processing', error_message: null } : null);
        }
      }
    } catch (err) {
      console.error('Error retrying reel:', err);
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
    if (selectedReelIds.size === displayedReels.length) {
      setSelectedReelIds(new Set());
    } else {
      setSelectedReelIds(new Set(displayedReels.map(r => r.id)));
    }
  };

  const handleBatchDelete = async () => {
    if (selectedReelIds.size === 0) return;
    const ids = Array.from(selectedReelIds);
    // Instant 0ms Optimistic UI Removal
    setReels(prev => {
      const next = prev.filter(r => !selectedReelIds.has(r.id));
      setSafeStorage('reelmind_cached_reels', next);
      return next;
    });
    setSelectedReelIds(new Set());
    setIsManageMode(false);

    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      await fetch(`${API_BASE}/reels/batch/delete?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reel_ids: ids })
      });
    } catch (err) {
      console.error('Batch delete error:', err);
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

  useEffect(() => {
    if (activeTab === 'chat' || selectedReel) {
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [activeTab, selectedReel]);

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

  const sendChatMessageText = async (questionText) => {
    if (!questionText || !questionText.trim()) return;

    const userMsg = { role: 'user', content: questionText.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatQuestion('');
    setChatLoading(true);

    try {
      const token = session?.auth_token || getSafeStorage('reelmind_token') || '';
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'token': token
        },
        body: JSON.stringify({ question: userMsg.content, history: chatMessages, token })
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: data.answer || 'I could not find an answer for that across your saved reels.',
          citations: data.citations || []
        }]);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setChatMessages(prev => [...prev, {
          role: 'assistant',
          content: errorData.detail || errorData.answer || 'I could not analyze your saved reels at this moment. Please try again.'
        }]);
      }
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Failed to connect to the server. Please check your network connection.'
      }]);
    } finally {
      setChatLoading(false);
      setTimeout(() => chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  const handleAskAI = async (e) => {
    if (e) e.preventDefault();
    sendChatMessageText(chatQuestion);
  };

  const copyText = (text, label = "Text") => {
    if (!text) return;
    try {
      navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`${label} copied to clipboard!`);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      toast.error('Failed to copy');
    }
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
    const matchingReel = reels.find(r => String(r.collection_id) === String(collectionId) && (r.thumbnail_url || r.shortcode));
    if (matchingReel) {
      return getReelThumbnail(matchingReel);
    }

    const col = collections.find(c => String(c.id) === String(collectionId));
    if (col?.cover_thumbnail) {
      if (col.cover_thumbnail.startsWith('/api/')) return `${API_BASE}${col.cover_thumbnail.replace('/api', '')}`;
      return col.cover_thumbnail;
    }
    if (col?.thumbnails && col.thumbnails.length > 0) {
      const t = col.thumbnails[0];
      if (t.startsWith('/api/')) return `${API_BASE}${t.replace('/api', '')}`;
      return t;
    }

    return null;
  };

  const getCollectionThumbnails = (collectionId) => {
    const matchingReels = reels
      .filter(r => String(r.collection_id) === String(collectionId))
      .slice(0, 4);

    if (matchingReels.length > 0) {
      return matchingReels.map(r => getReelThumbnail(r)).filter(Boolean);
    }

    const col = collections.find(c => String(c.id) === String(collectionId));
    if (col?.thumbnails && col.thumbnails.length > 0) {
      return col.thumbnails.map(t => t.startsWith('/api/') ? `${API_BASE}${t.replace('/api', '')}` : t);
    }

    return [];
  };

  return (
    <TooltipProvider>
      <div className="ig-app-wrapper">
      {/* ======================================================== */}
      {/* INSTAGRAM-STYLE STICKY TOP NAVBAR */}
      {/* ======================================================== */}
      {isManageMode ? (
        <header className="ig-top-navbar ig-manage-navbar" style={{ justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <button
              onClick={() => { setIsManageMode(false); setSelectedReelIds(new Set()); }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f8fafa', padding: '4px', display: 'flex', alignItems: 'center' }}
              title="Cancel"
            >
              <X size={24} strokeWidth={2.2} />
            </button>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#f8fafa', letterSpacing: '-0.02em' }}>
              {selectedReelIds.size > 0 ? `${selectedReelIds.size} selected` : 'All Posts'}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <button
              onClick={handleSelectAll}
              className="ig-filter-pill"
              style={{ fontSize: '0.82rem', fontWeight: '500', padding: '6px 14px' }}
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
              style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#f8fafa', padding: '2px' }}
              title="Back"
            >
              <ArrowLeft size={24} strokeWidth={2.2} />
            </button>
            <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#f8fafa', letterSpacing: '-0.02em', margin: 0 }}>
              {selectedCollection.name}
            </h1>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setShowCollectionMenuModal(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f8fafa', padding: '4px', display: 'flex', alignItems: 'center' }}
              title="Collection Options"
            >
              <MoreVertical size={24} strokeWidth={2.2} />
            </button>
          </div>
        </header>
      ) : activeTab === 'vault' ? (
        <header className="ig-top-navbar">
          <div
            onClick={() => {
              setActiveTab('vault');
              setActiveViewFilter('All');
              setSelectedCollection(null);
              setSearchQuery('');
              setSelectedReel(null);
              setIsManageMode(false);
              setSelectedReelIds(new Set());
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', userSelect: 'none' }}
            title="Go to All Saved"
          >
            <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: 'var(--text-heading)', letterSpacing: '-0.02em', fontFamily: 'var(--font-main)', margin: 0 }}>
              ReelDex
            </h1>
          </div>

          {/* Center: Search Box & Highlighted Broadened Ask AI Button */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', margin: '0 8px' }}>
            <div className="ig-navbar-search" style={{ flex: 1, maxWidth: '380px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <Search size={14} color="#8e8e8e" style={{ position: 'absolute', left: '12px' }} />
                <input
                  type="text"
                  placeholder="Search transcripts & tools..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '7px 55px 7px 34px',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--border-light)',
                    background: 'var(--bg-input)',
                    fontSize: '0.84rem',
                    outline: 'none',
                    color: 'var(--text-main)'
                  }}
                />
                {!searchQuery && (
                  <button
                    type="button"
                    onClick={() => setCommandOpen(true)}
                    style={{
                      position: 'absolute',
                      right: '8px',
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.14)',
                      color: '#a1a1aa',
                      borderRadius: '5px',
                      fontSize: '0.7rem',
                      fontWeight: '600',
                      padding: '1px 6px',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '2px',
                      userSelect: 'none'
                    }}
                    title="Open Spotlight Command Palette (⌘K)"
                  >
                    <span>⌘K</span>
                  </button>
                )}
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

            {/* Highlighted Ask Dex AI Button */}
            <button
              onClick={() => setActiveTab('chat')}
              className="ig-ask-ai-center-btn"
              title="Ask Dex AI across your saved reels"
            >
              <span>Ask Dex AI</span>
            </button>
          </div>

          {/* Right Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>

            {/* User / Instagram Status Capsule */}
            <button
              onClick={handleGeneratePairingCode}
              className="ig-user-status-btn"
              title="Instagram Connection Status - Click to Pair"
            >
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <User size={15} color="#e4e4e7" />
                <span style={{
                  position: 'absolute',
                  bottom: '-1px',
                  right: '-2px',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: session.is_instagram_linked ? '#10b981' : '#f59e0b',
                  border: '1.5px solid #0c0f14'
                }} />
              </div>
              <span className="ig-username-text">
                {session.instagram_username ? `@${session.instagram_username}` : (session.display_name || 'User')}
              </span>
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
      ) : null}

      {/* ======================================================== */}
      {/* MAIN CONTENT AREA */}
      {/* ======================================================== */}
      {activeTab === 'vault' && (
        <div
          className="ig-content-container"
          style={{
            padding: isManageMode ? '14px 16px 100px' : '14px 16px 60px',
            display: 'flex',
            flexDirection: 'column'
          }}
        >
          {/* Mobile Search Bar (prominently available on mobile devices) */}
          {!isManageMode && (
            <div className="ig-mobile-search-bar" style={{ marginBottom: '14px' }}>
              <div style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                background: '#181c1f',
                borderRadius: '10px',
                border: '1px solid #282f34',
                padding: '0 12px',
                height: '40px'
              }}>
                <Search size={15} color="#8e8e8e" style={{ marginRight: '8px', flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder={selectedCollection ? `Search in ${selectedCollection.name}...` : "Search transcripts, tools, creators..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: 'none',
                    outline: 'none',
                    color: '#f8fafa',
                    fontSize: '0.88rem',
                    padding: 0
                  }}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#8e8e8e',
                      cursor: 'pointer',
                      padding: '4px',
                      display: 'flex',
                      alignItems: 'center'
                    }}
                    title="Clear search"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filter Pills (Instagram Horizontal Scrollable Strip) */}
          {!selectedCollection && !isManageMode && (
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

        {/* 1. COLLECTIONS SECTION (Shown when on 'All' or 'Collections' filter) */}
            {(!selectedCollection && !isManageMode && (activeViewFilter === 'All' || activeViewFilter === 'Collections')) && (
              <div style={{ marginBottom: '28px' }}>
                {activeViewFilter === 'All' && (
                  <div className="ig-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '0.98rem', fontWeight: '500', color: '#f8fafa' }}>
                      Collections
                    </h2>
                    <button
                      onClick={() => setActiveViewFilter('Collections')}
                      style={{ background: 'none', border: 'none', color: '#90a4f2', fontWeight: '500', fontSize: '0.88rem', cursor: 'pointer' }}
                    >
                      See all
                    </button>
                  </div>
                )}

                {collections.length === 0 ? (
                  <div style={{
                    padding: '24px 20px',
                    borderRadius: '14px',
                    background: '#181c1f',
                    border: '1px solid #282f34',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    margin: '0 16px'
                  }}>
                    <div>
                      <div style={{ fontSize: '0.92rem', fontWeight: '500', color: '#f8fafa' }}>Organize with Collections</div>
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
                              <img src={coverImg} alt={col.name} referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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
                                  <img key={idx} src={img} alt="" referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ))}
                              </div>
                            ) : thumbs.length > 0 ? (
                              <img src={thumbs[0]} alt={col.name} referrerPolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
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
            {(activeViewFilter !== 'Collections' || selectedCollection) && (
              <div>
                {!isManageMode && selectedCollection && (
                  <div style={{
                    display: 'flex',
                    width: '100%',
                    borderBottom: '1px solid #282f34',
                    marginBottom: '20px',
                    marginTop: '-16px'
                  }}>
                    <button
                      onClick={() => setCollectionSubTab('all')}
                      style={{
                        flex: 1,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: collectionSubTab === 'all' ? '#f8fafa' : '#71717a',
                        padding: '12px 0',
                        borderBottom: collectionSubTab === 'all' ? '1.5px solid #f8fafa' : '1.5px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                      title="Posts"
                    >
                      <Grid size={22} strokeWidth={collectionSubTab === 'all' ? 2.2 : 1.6} />
                    </button>
                    <button
                      onClick={() => setCollectionSubTab('reels')}
                      style={{
                        flex: 1,
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: collectionSubTab === 'reels' ? '#f8fafa' : '#71717a',
                        padding: '12px 0',
                        borderBottom: collectionSubTab === 'reels' ? '1.5px solid #f8fafa' : '1.5px solid transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        transition: 'all 0.15s ease'
                      }}
                      title="Reels"
                    >
                      <Play size={22} strokeWidth={collectionSubTab === 'reels' ? 2.2 : 1.6} />
                    </button>
                  </div>
                )}

                {!isManageMode && !selectedCollection && (
                  <div className="ig-reels-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <h2 style={{ fontSize: '0.98rem', fontWeight: '500', color: '#f8fafa' }}>
                      Reels and posts
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {reels.length > 0 && (
                        <button
                          onClick={() => setIsManageMode(true)}
                          style={{ background: 'none', border: 'none', color: '#90a4f2', fontWeight: '500', fontSize: '0.88rem', cursor: 'pointer' }}
                        >
                          Manage
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {(initialLoading || reelsLoading) ? (
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
                ) : displayedReels.length === 0 ? (
                  selectedCollection ? (
                    <div style={{
                      padding: '70px 20px',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto'
                    }}>
                      {/* Circle Icon Badge */}
                      <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        border: '2px solid #f8fafa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '18px'
                      }}>
                        <Bookmark size={28} color="#f8fafa" strokeWidth={1.8} />
                      </div>

                      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#f8fafa', marginBottom: '8px' }}>
                        Save to this collection
                      </h3>
                      <p style={{ fontSize: '0.86rem', color: '#8e8e8e', maxWidth: '340px', lineHeight: '1.45', marginBottom: '20px' }}>
                        Save Reels and posts to easily find your favorite videos anytime.
                      </p>

                      <button
                        onClick={async () => {
                          await fetchAllVaultReels();
                          setShowAddToThisCollectionModal(true);
                        }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#90a4f2',
                          fontSize: '0.94rem',
                          fontWeight: '600',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px'
                        }}
                      >
                        <Plus size={16} strokeWidth={2.4} /> Add to collection
                      </button>
                    </div>
                  ) : (
                    <div style={{
                      padding: '70px 20px',
                      textAlign: 'center',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto'
                    }}>
                      {/* Circle Icon Badge */}
                      <div style={{
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        border: '2px solid #f8fafa',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '18px'
                      }}>
                        <Bookmark size={28} color="#f8fafa" strokeWidth={1.8} />
                      </div>

                      <h3 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#f8fafa', marginBottom: '8px' }}>
                        {activeViewFilter !== 'All' ? `No reels in ${activeViewFilter}` : 'No Saved Reels Found'}
                      </h3>
                      <p style={{ fontSize: '0.86rem', color: '#8e8e8e', maxWidth: '340px', lineHeight: '1.45', marginBottom: '20px' }}>
                        {activeViewFilter !== 'All'
                          ? `Reels tagged with "${activeViewFilter}" will automatically appear here once transcribed.`
                          : session.is_instagram_linked 
                            ? 'Send any Instagram Reel in DM to @reeldex.io to automatically transcribe audio and index tools.'
                            : 'Link your Instagram account to automatically sync and transcribe reels you share in Direct Messages.'}
                      </p>

                      {activeViewFilter !== 'All' ? (
                        <button
                          onClick={() => setActiveViewFilter('All')}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#90a4f2',
                            fontSize: '0.94rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px'
                          }}
                        >
                          View all saved reels
                        </button>
                      ) : session.is_instagram_linked ? (
                        <a
                          href="https://ig.me/m/reeldex.io"
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#90a4f2',
                            fontSize: '0.94rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px',
                            textDecoration: 'none'
                          }}
                        >
                          <InstagramIcon size={16} /> Open Instagram DM (@reeldex.io)
                        </a>
                      ) : (
                        <button
                          onClick={handleGeneratePairingCode}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#90a4f2',
                            fontSize: '0.94rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 12px'
                          }}
                        >
                          <InstagramIcon size={16} /> Link Instagram Account
                        </button>
                      )}
                    </div>
                  )
                ) : (
                  <div className="ig-reels-grid">
                    {displayedReels.map((reel) => (
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
                        {(() => {
                          const thumbUrl = getReelThumbnail(reel);
                          return (
                            <div className="modern-card-thumbnail-box">
                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={reel.title || 'Reel Thumbnail'}
                                  referrerPolicy="no-referrer"
                                  onError={(e) => handleThumbnailError(e, reel.shortcode)}
                                />
                              ) : (
                                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #181c20 0%, #0c0f14 100%)' }}>
                                  <Play size={28} color="#90a4f2" opacity={0.6} />
                                </div>
                              )}
                              
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
                          );
                        })()}

                        {/* Card Body with High-End Typography */}
                        <div className="modern-card-body">
                          <div>
                            {/* Author Handle */}
                            <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: '400', marginBottom: '4px' }}>
                              @{reel.author || reel.sender_username || 'creator'}
                            </div>

                            {/* Video Title */}
                            <h3 style={{
                              fontSize: '0.94rem',
                              fontWeight: '500',
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
                              {reel.status === 'failed' ? (
                                <button
                                  type="button"
                                  onClick={(e) => handleRetryReel(reel.id, e)}
                                  style={{ background: 'none', border: 'none', padding: '4px 0', textAlign: 'left', color: '#f87171', display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '500' }}
                                >
                                  <RotateCw size={12} /> Transcription failed • Tap to retry
                                </button>
                              ) : (
                                formatSummary(reel.summary) || reel.preview_text || (
                                  <button
                                    type="button"
                                    onClick={(e) => handleRetryReel(reel.id, e)}
                                    style={{ background: 'none', border: 'none', padding: '4px 0', textAlign: 'left', color: '#90a4f2', display: 'inline-flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.82rem', fontWeight: '500' }}
                                    title="Tap to retry transcription"
                                  >
                                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#90a4f2', animation: 'pulse 1.2s infinite' }} />
                                    Transcribing spoken audio... (Tap to retry)
                                  </button>
                                )
                              )}
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

                              {reel.status === 'failed' && (
                                <button
                                  type="button"
                                  onClick={(e) => handleRetryReel(reel.id, e)}
                                  style={{
                                    background: 'rgba(239, 68, 68, 0.1)',
                                    border: '1px solid rgba(239, 68, 68, 0.25)',
                                    color: '#f87171',
                                    cursor: 'pointer',
                                    padding: '5px 8px',
                                    borderRadius: '6px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    fontSize: '0.72rem',
                                    fontWeight: '600'
                                  }}
                                  title="Retry Transcription"
                                >
                                  <RotateCw size={12} />
                                  <span>Retry</span>
                                </button>
                              )}

                              <button
                                type="button"
                                onTouchEnd={(e) => handleDeleteReel(reel.id, e)}
                                onClick={(e) => handleDeleteReel(reel.id, e)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#94a3b8',
                                  cursor: 'pointer',
                                  padding: '8px 10px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  borderRadius: '6px',
                                  touchAction: 'manipulation'
                                }}
                                title="Delete Reel"
                              >
                                <Trash2 size={16} />
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

        {/* TAB 2: ASK AI COPILOT (DEDICATED FIXED APP VIEW) */}
        {activeTab === 'chat' && (
          <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: '#0c0f14',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Top Fixed Header */}
            <header style={{
              minHeight: '60px',
              height: '60px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px',
              background: 'rgba(12, 15, 20, 0.98)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              flexShrink: 0,
              zIndex: 10
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <button
                  onClick={() => setActiveTab('vault')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', color: '#f8fafa', padding: '4px' }}
                  title="Back to Vault"
                >
                  <ArrowLeft size={24} strokeWidth={2.2} />
                </button>
                <h1 style={{ fontSize: '1.25rem', fontWeight: '600', color: '#f8fafa', letterSpacing: '-0.02em', margin: 0 }}>
                  Ask Dex AI
                </h1>
              </div>

              <button
                onClick={() => {
                  setChatMessages([
                    {
                      role: 'assistant',
                      content: 'I am your **Dex AI Copilot**. Ask me anything across your saved Instagram Reels — like *"Summarize all job interview tips"*, *"List all design & AI tools mentioned"*, or *"Find workout & communication advice"*.'
                    }
                  ]);
                }}
                className="ig-filter-pill"
                style={{ fontSize: '0.8rem', padding: '5px 12px' }}
                title="Start a new chat"
              >
                New chat
              </button>
            </header>

            {/* Middle Message Stream (Scrollable Only Here, No Scrollbar Visible) */}
            <div
              className="no-scrollbar"
              style={{
                flex: 1,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '12px 16px',
                maxWidth: '820px',
                width: '100%',
                margin: '0 auto',
                boxSizing: 'border-box',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none'
              }}
            >
              {chatMessages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: msg.role === 'user' ? '82%' : '92%',
                    minWidth: 0,
                    boxSizing: 'border-box',
                    overflowWrap: 'break-word',
                    wordBreak: 'break-word',
                    padding: msg.role === 'user' ? '10px 16px' : '14px 18px',
                    borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                    background: msg.role === 'user' ? '#3797f0' : '#181c1f',
                    color: msg.role === 'user' ? '#ffffff' : '#f8fafa',
                    border: msg.role === 'user' ? 'none' : '1px solid #282f34',
                    fontSize: '0.9rem',
                    lineHeight: '1.55',
                    fontWeight: '400'
                  }}
                >
                  {msg.role === 'user' ? (
                    msg.content
                  ) : (
                    <>
                      <div className="markdown-prose" style={{ color: '#f8fafa' }}>
                        <ReactMarkdown
                          components={{
                            a: ({ node, href, ...props }) => {
                              const isIg = isInstagramUrl(href);
                              return (
                                <a
                                  {...props}
                                  href={href}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => {
                                    if (isIg) {
                                      openInstagramUrl(href, e);
                                    }
                                  }}
                                  style={{
                                    color: '#90a4f2',
                                    textDecoration: 'underline',
                                    textUnderlineOffset: '3px',
                                    fontWeight: '500',
                                    cursor: 'pointer'
                                  }}
                                />
                              );
                            }
                          }}
                        >
                          {formatSanitizedMarkdown(msg.content)}
                        </ReactMarkdown>
                      </div>

                      {/* Action Bar: Copy for WhatsApp / Notes, Copy MD & Save .md Options */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'flex-end',
                        flexWrap: 'wrap',
                        gap: '8px',
                        marginTop: '12px',
                        paddingTop: '10px',
                        borderTop: '1px solid rgba(255, 255, 255, 0.08)'
                      }}>
                        <button
                          onClick={() => handleCopyMessageText(msg.content, idx, 'whatsapp')}
                          className="ig-chat-action-btn"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(55, 151, 240, 0.15)',
                            border: '1px solid rgba(55, 151, 240, 0.3)',
                            color: '#70b5f9',
                            fontSize: '0.78rem',
                            fontWeight: '600',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            outline: 'none',
                            userSelect: 'none'
                          }}
                          title="Copy formatted text ready for WhatsApp and Notes app"
                        >
                          {copiedMsgIdx === `${idx}-whatsapp` ? (
                            <>
                              <Check size={13} color="#10b981" />
                              <span style={{ color: '#10b981', fontWeight: '600' }}>Copied for WhatsApp!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} color="#70b5f9" />
                              <span>Copy for WhatsApp / Notes</span>
                            </>
                          )}
                        </button>

                        <button
                          onClick={() => handleCopyMessageText(msg.content, idx, 'markdown')}
                          className="ig-chat-action-btn"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: '#d4d4d8',
                            fontSize: '0.78rem',
                            fontWeight: '500',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            outline: 'none',
                            userSelect: 'none'
                          }}
                          title="Copy raw Markdown format"
                        >
                          {copiedMsgIdx === `${idx}-markdown` ? (
                            <>
                              <Check size={13} color="#10b981" />
                              <span style={{ color: '#10b981', fontWeight: '600' }}>Copied MD!</span>
                            </>
                          ) : (
                            <>
                              <Copy size={13} color="#a1a1aa" />
                              <span>Copy MD</span>
                            </>
                          )}
                        </button>

                        {hasMoreItemsToShow(msg.content) && (
                          <button
                            onClick={() => handleShowMoreResults(idx)}
                            className="ig-chat-action-btn"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              background: 'rgba(16, 185, 129, 0.15)',
                              border: '1px solid rgba(16, 185, 129, 0.3)',
                              color: '#34d399',
                              fontSize: '0.78rem',
                              fontWeight: '600',
                              padding: '6px 12px',
                              borderRadius: '20px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                              outline: 'none',
                              userSelect: 'none'
                            }}
                            title="Ask Dex AI to list remaining results starting from where it left off"
                          >
                            <Plus size={13} color="#34d399" />
                            <span>Show More Results</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleDownloadMessageText(msg.content, idx)}
                          className="ig-chat-action-btn"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'rgba(255, 255, 255, 0.06)',
                            border: '1px solid rgba(255, 255, 255, 0.12)',
                            color: '#d4d4d8',
                            fontSize: '0.78rem',
                            fontWeight: '500',
                            padding: '6px 12px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            outline: 'none',
                            userSelect: 'none'
                          }}
                          title="Save clean Markdown (.md) file"
                        >
                          <Download size={13} color="#a1a1aa" />
                          <span>Save .md</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {chatLoading && (
                <div style={{
                  alignSelf: 'flex-start',
                  padding: '10px 16px',
                  borderRadius: '18px 18px 18px 4px',
                  background: '#181c1f',
                  border: '1px solid #282f34',
                  fontSize: '0.84rem',
                  color: '#8e8e8e',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#90a4f2', animation: 'pulse 1.2s infinite' }} />
                  <span>Searching transcripts and synthesizing answer...</span>
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            {/* Pinned Bottom Input Container */}
            <div style={{
              maxWidth: '820px',
              width: '100%',
              margin: '0 auto',
              padding: '8px 16px 16px',
              flexShrink: 0,
              boxSizing: 'border-box'
            }}>
              {/* Suggested Prompt Chips */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {(() => {
                  const activeCats = categories.filter(c => c && c !== 'All');
                  const prompts = [];
                  if (activeCats.length > 0) {
                    prompts.push(`Summarize top ${activeCats[0]} insights`);
                    if (activeCats.length > 1) {
                      prompts.push(`Key takeaways from ${activeCats[1]} reels`);
                    }
                  }
                  prompts.push("What AI & design tools were mentioned?");
                  prompts.push("List all key websites and tools mentioned");
                  prompts.push("What are the top health & wellness tips?");
                  return prompts.slice(0, 4);
                })().map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setChatQuestion(prompt);
                      sendChatMessageText(prompt);
                    }}
                    style={{
                      fontSize: '0.8rem',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      background: '#181c1f',
                      border: '1px solid #282f34',
                      color: '#f8fafa',
                      fontWeight: '400',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>

              {/* Chat Input Bar */}
              <form onSubmit={handleAskAI} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: '#181c1f',
                border: '1.5px solid #282f34',
                borderRadius: '24px',
                padding: '4px 6px 4px 16px'
              }}>
                <input
                  type="text"
                  placeholder="Ask a question across all your saved Reels..."
                  value={chatQuestion}
                  onChange={(e) => setChatQuestion(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 0',
                    border: 'none',
                    background: 'transparent',
                    color: '#f8fafa',
                    outline: 'none',
                    fontSize: '0.92rem',
                    fontWeight: '400'
                  }}
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatQuestion.trim()}
                  style={{
                    background: chatQuestion.trim() ? '#90a4f2' : '#27282c',
                    color: chatQuestion.trim() ? '#0c0f14' : '#71717a',
                    width: '36px',
                    height: '36px',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    cursor: chatQuestion.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.15s ease',
                    flexShrink: 0
                  }}
                >
                  <Send size={15} />
                </button>
              </form>
            </div>
          </div>
        )}

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
            style={{ color: selectedReelIds.size > 0 ? '#ffffff' : '#71717a' }}
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
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px', padding: '16px 18px 28px', background: '#181c1f', borderRadius: '18px 18px 0 0', border: '1px solid #282f34' }}>
            {/* Top Drag Handle */}
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 16px' }} />
            
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafa', margin: 0 }}>
                Add to collection
              </h3>
              <button
                onClick={() => { setShowBatchCollectionModal(false); setShowCreateCollectionModal(true); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f8fafa', padding: '4px', display: 'flex', alignItems: 'center' }}
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
                        background: '#121518',
                        border: '1px solid #282f34'
                      }}>
                        {coverImg ? (
                          <img src={coverImg} alt={col.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#121518' }}>
                            <Folder size={26} color="#8e8e8e" />
                          </div>
                        )}
                      </div>
                      <div style={{
                        fontSize: '0.84rem',
                        fontWeight: '500',
                        color: '#f8fafa',
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
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '16px 20px 24px', background: '#181c1f', borderRadius: '18px 18px 0 0', border: '1px solid #282f34' }}>
            {/* Top Handle Bar */}
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 16px' }} />

            {/* Header: Cancel | New collection | Next */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <button
                type="button"
                onClick={() => { setShowCreateCollectionModal(false); setNewCollectionName(''); }}
                style={{ background: 'none', border: 'none', color: '#f8fafa', fontSize: '0.96rem', fontWeight: '500', cursor: 'pointer', padding: 0 }}
              >
                Cancel
              </button>

              <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#f8fafa', margin: 0, textAlign: 'center' }}>
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
                    background: '#000000',
                    color: '#f8fafa',
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
                  <Users size={22} color="#f8fafa" />
                  <div>
                    <div style={{ fontSize: '0.92rem', fontWeight: '700', color: '#f8fafa' }}>
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
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '14px 20px 24px', background: '#181c1f', borderRadius: '18px 18px 0 0', border: '1px solid #282f34' }}>
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
                  color: '#f8fafa',
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
                  color: '#f8fafa',
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
                  color: '#f8fafa',
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
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '440px', padding: '16px 20px 24px', background: '#181c1f', borderRadius: '18px 18px 0 0', border: '1px solid #282f34' }}>
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 16px' }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '22px' }}>
              <button
                type="button"
                onClick={() => setShowEditCollectionModal(false)}
                style={{ background: 'none', border: 'none', color: '#f8fafa', fontSize: '0.96rem', fontWeight: '500', cursor: 'pointer', padding: 0 }}
              >
                Cancel
              </button>

              <h3 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafa', margin: 0, textAlign: 'center' }}>
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
                  background: '#000000',
                  color: '#f8fafa',
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
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px', height: '90vh', maxHeight: '90vh', display: 'flex', flexDirection: 'column', padding: '14px 14px 20px', background: '#181c1f', borderRadius: '18px 18px 0 0', border: '1px solid #282f34' }}>
            <div style={{ width: '38px', height: '4px', background: '#3f3f46', borderRadius: '2px', margin: '0 auto 14px' }} />

            {/* Header: Back Arrow | Add from saved | Save */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', padding: '0 4px' }}>
              <button
                type="button"
                onClick={() => setShowAddToThisCollectionModal(false)}
                style={{ background: 'none', border: 'none', color: '#f8fafa', display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px' }}
                title="Back"
              >
                <ArrowLeft size={22} strokeWidth={2.2} />
              </button>

              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', color: '#f8fafa', margin: 0, textAlign: 'center' }}>
                Add from saved
              </h3>

              <button
                type="button"
                onClick={handleAddReelsToCurrentCollection}
                disabled={addingReelsToCol}
                style={{
                  background: 'none',
                  border: 'none',
                  color: selectedReelIdsForAdd.size > 0 ? '#90a4f2' : '#f8fafa',
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
              {allVaultReels.length === 0 ? (
                [1, 2, 3, 4, 5, 6].map(n => (
                  <div key={n} className="skeleton-shimmer" style={{ aspectRatio: '1 / 1', background: '#181c1f' }} />
                ))
              ) : (
                allVaultReels.map(reel => {
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
                      background: '#121518',
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
                      background: isSelected ? '#f8fafa' : 'rgba(0, 0, 0, 0.4)',
                      border: isSelected ? '1.5px solid #f8fafa' : '1.5px solid rgba(255, 255, 255, 0.7)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      zIndex: 5
                    }}>
                      {isSelected && <Check size={13} color="#000000" strokeWidth={3} />}
                    </div>
                  </div>
                );
              }))}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* INSTAGRAM PAIRING MODAL */}
      {/* ======================================================== */}
      {showPairModal && (
        <div className="modal-overlay" onClick={() => setShowPairModal(false)}>
          <div className="modal-sheet" onClick={e => e.stopPropagation()} style={{ maxWidth: '460px', padding: '22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '1.08rem', fontWeight: '600', color: '#f8fafa', margin: '0 0 3px', letterSpacing: '-0.01em' }}>
                  Link Your Instagram
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#8e8e8e', margin: 0, fontWeight: '400' }}>
                  Sync reels via Instagram DM in 10 seconds
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPairModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8e8e8e',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div style={{ background: '#181c1f', border: '1px solid #282f34', borderRadius: '12px', padding: '20px', textAlign: 'center', marginBottom: '16px' }}>
              <span style={{ fontSize: '0.72rem', fontWeight: '600', color: '#8e8e8e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Your Unique Linking Code
              </span>
              <div style={{ fontSize: '2rem', fontWeight: '700', fontFamily: 'monospace', letterSpacing: '0.12em', color: '#f8fafa', margin: '6px 0' }}>
                {pairingCode || 'MIND-849201'}
              </div>
              <button onClick={() => copyText(pairingCode)} className="btn-white" style={{ fontSize: '0.78rem' }}>
                {copied ? <Check size={13} color="#10b981" /> : <Copy size={13} />} Copy Code
              </button>
            </div>

            <div style={{ fontSize: '0.84rem', color: '#f8fafa', lineHeight: '1.6', marginBottom: '20px' }}>
              <ol style={{ paddingLeft: '18px', margin: 0 }}>
                <li style={{ marginBottom: '4px' }}>Open Instagram Direct and message <strong style={{ color: '#90a4f2' }}>@reeldex.io</strong>.</li>
                <li style={{ marginBottom: '4px' }}>Send your code: <code style={{ color: '#90a4f2', background: '#121518', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>{pairingCode}</code></li>
                <li>Done! Any Reel you share in DM will automatically transcribe and save here.</li>
              </ol>
            </div>

            <a
              href="https://ig.me/m/reeldex.io"
              target="_blank"
              rel="noreferrer"
              onClick={(e) => openInstagramUrl('https://ig.me/m/reeldex.io', e)}
              className="btn-blue"
              style={{ width: '100%', justifyContent: 'center', padding: '10px', display: 'flex', alignItems: 'center', gap: '6px', textDecoration: 'none', borderRadius: '8px', fontWeight: '600', fontSize: '0.88rem' }}
            >
              <span>Open Instagram DM</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* REEL DETAIL FULL-PAGE VIEW (INSTAGRAM NATIVE) */}
      {/* ======================================================== */}
      {selectedReel && (
        <div style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          background: '#0c0f14',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Top Sticky Header (Seamless, No Divider) */}
          <header style={{
            position: 'sticky',
            top: 0,
            zIndex: 30,
            background: 'rgba(12, 15, 20, 0.96)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderBottom: 'none',
            minHeight: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            boxSizing: 'border-box'
          }}>
            {/* Left: Back Button */}
            <button
              onClick={() => setSelectedReel(null)}
              style={{
                background: 'none',
                border: 'none',
                color: '#f8fafa',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer',
                padding: '8px 12px 8px 0',
                fontSize: '1rem',
                fontWeight: '500'
              }}
            >
              <ArrowLeft size={24} strokeWidth={2.2} />
              <span>Back</span>
            </button>

            {/* Center: Author info */}
            <div style={{ textAlign: 'center', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ fontSize: '0.94rem', fontWeight: '500', color: '#f8fafa' }}>
                @{selectedReel.author || selectedReel.sender_username || 'Creator'}
              </span>
            </div>

            {/* Right: Actions (Retry only if failed, Delete in sleek gray) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {selectedReel.status === 'failed' && (
                <button
                  type="button"
                  onTouchEnd={(e) => handleRetryReel(selectedReel.id, e)}
                  onClick={(e) => handleRetryReel(selectedReel.id, e)}
                  style={{
                    background: 'rgba(144, 164, 242, 0.12)',
                    border: '1px solid rgba(144, 164, 242, 0.25)',
                    color: '#90a4f2',
                    cursor: 'pointer',
                    padding: '8px 14px',
                    borderRadius: '8px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    fontSize: '0.84rem',
                    fontWeight: '600',
                    touchAction: 'manipulation'
                  }}
                  title="Retry Transcription"
                >
                  <RotateCw size={14} />
                  <span>Retry</span>
                </button>
              )}

              <button
                type="button"
                onTouchEnd={(e) => handleDeleteReel(selectedReel.id, e)}
                onClick={(e) => handleDeleteReel(selectedReel.id, e)}
                style={{
                  background: '#181c1f',
                  border: '1px solid #282f34',
                  color: '#e4e4e7',
                  cursor: 'pointer',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '0.84rem',
                  fontWeight: '500',
                  touchAction: 'manipulation',
                  transition: 'background 0.15s ease'
                }}
                title="Delete Reel"
              >
                <Trash2 size={14} color="#a1a1aa" />
                <span>Delete</span>
              </button>
            </div>
          </header>

          {/* Main Full-Page Content */}
          <div style={{
            maxWidth: '820px',
            width: '100%',
            margin: '0 auto',
            padding: '12px 16px 80px',
            display: 'flex',
            flexDirection: 'column',
            gap: '18px'
          }}>
            {/* Header: Clean Editorial Title & Category Eyebrow */}
            <div>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.74rem',
                fontWeight: '500',
                color: '#8e8e8e',
                textTransform: 'uppercase',
                letterSpacing: '0.07em',
                marginBottom: '6px'
              }}>
                <span>{selectedReel.category || 'General'}</span>
                {selectedReel.duration && (
                  <>
                    <span>•</span>
                    <span>{Math.round(selectedReel.duration)}s</span>
                  </>
                )}
              </div>
              <h1 style={{ fontSize: '1.35rem', fontWeight: '600', color: '#f8fafa', letterSpacing: '-0.02em', margin: '0 0 4px', lineHeight: '1.35' }}>
                {selectedReel.title || `Reel by @${selectedReel.author || 'Creator'}`}
              </h1>
              <p style={{ fontSize: '0.85rem', color: '#8e8e8e', margin: 0, fontWeight: '400' }}>
                by @{selectedReel.author || selectedReel.sender_username || 'Creator'}
              </p>
            </div>

            {/* Video Thumbnail Preview Banner */}
            {(selectedReel.thumbnail_url || selectedReel.shortcode) && (
              <div style={{
                position: 'relative',
                width: '100%',
                maxHeight: '340px',
                aspectRatio: '16 / 9',
                borderRadius: '16px',
                overflow: 'hidden',
                backgroundColor: '#000000',
                border: '1px solid #282f34'
              }}>
                <img
                  src={selectedReel.thumbnail_url || (selectedReel.shortcode ? `https://www.instagram.com/p/${selectedReel.shortcode}/media/?size=l` : '')}
                  alt={selectedReel.title || 'Reel Thumbnail'}
                  referrerPolicy="no-referrer"
                  onError={(e) => handleThumbnailError(e, selectedReel.shortcode)}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
                {selectedReel.reel_url && (
                  <div
                    onClick={(e) => openInstagramUrl(selectedReel.reel_url, e)}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'linear-gradient(to top, rgba(0, 0, 0, 0.7) 0%, transparent 60%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '10px 22px',
                      borderRadius: '24px',
                      background: 'rgba(0, 0, 0, 0.82)',
                      backdropFilter: 'blur(10px)',
                      WebkitBackdropFilter: 'blur(10px)',
                      border: '1px solid rgba(255, 255, 255, 0.25)',
                      color: '#ffffff',
                      fontWeight: '600',
                      fontSize: '0.86rem',
                      boxShadow: '0 6px 20px rgba(0,0,0,0.6)'
                    }}>
                      <Play size={14} color="#ffffff" style={{ fill: '#ffffff' }} />
                      <span>Watch on Instagram</span>
                      <ExternalLink size={12} />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Folder Move & Translation Row */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              background: '#181c1f',
              border: '1px solid #282f34',
              borderRadius: '12px',
              padding: '10px 14px',
              flexWrap: 'wrap',
              gap: '10px',
              position: 'relative'
            }}>
              {/* Custom Collection Dropdown Picker */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
                <span style={{ fontSize: '0.82rem', color: '#8e8e8e', fontWeight: '500' }}>
                  Collection:
                </span>
                
                <div style={{ position: 'relative' }}>
                  <button
                    type="button"
                    onClick={() => setShowDetailFolderPicker(prev => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: '#121518',
                      border: '1px solid #282f34',
                      borderRadius: '8px',
                      padding: '7px 12px',
                      color: '#f8fafa',
                      fontSize: '0.82rem',
                      fontWeight: '500',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <Folder size={14} color="#90a4f2" strokeWidth={2} />
                    <span style={{ maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selectedReel.collection_name || 'None (All saved)'}
                    </span>
                    <ChevronDown size={14} color="#8e8e8e" />
                  </button>

                  {/* Floating Custom Dropdown Menu */}
                  {showDetailFolderPicker && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 'calc(100% + 6px)',
                        left: 0,
                        zIndex: 60,
                        minWidth: '210px',
                        background: '#181c1f',
                        border: '1px solid #282f34',
                        borderRadius: '12px',
                        padding: '6px',
                        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px'
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          handleAssignCollection(selectedReel.id, null);
                          setShowDetailFolderPicker(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '9px 12px',
                          borderRadius: '8px',
                          background: !selectedReel.collection_id ? '#22272b' : 'transparent',
                          border: 'none',
                          color: '#f8fafa',
                          fontSize: '0.84rem',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.15s ease'
                        }}
                      >
                        <span>None (All saved)</span>
                        {!selectedReel.collection_id && <Check size={14} color="#90a4f2" strokeWidth={2.5} />}
                      </button>

                      {collections.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            handleAssignCollection(selectedReel.id, c.id);
                            setShowDetailFolderPicker(false);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '9px 12px',
                            borderRadius: '8px',
                            background: String(selectedReel.collection_id) === String(c.id) ? '#22272b' : 'transparent',
                            border: 'none',
                            color: '#f8fafa',
                            fontSize: '0.84rem',
                            cursor: 'pointer',
                            textAlign: 'left',
                            transition: 'background 0.15s ease'
                          }}
                        >
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</span>
                          {String(selectedReel.collection_id) === String(c.id) && <Check size={14} color="#90a4f2" strokeWidth={2.5} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Retry Banner only if Failed */}
            {selectedReel.status === 'failed' && (
              <div style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                flexWrap: 'wrap'
              }}>
                <div>
                  <div style={{ fontSize: '0.88rem', fontWeight: '600', color: '#f87171' }}>
                    Transcription Incomplete
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#a1a1aa', marginTop: '2px' }}>
                    {selectedReel.error_message || 'Tap retry to re-process audio and generate AI summary.'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(e) => handleRetryReel(selectedReel.id, e)}
                  style={{
                    background: '#22272b',
                    border: '1px solid #3f3f46',
                    borderRadius: '8px',
                    padding: '7px 14px',
                    color: '#f8fafa',
                    fontSize: '0.82rem',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <RotateCw size={13} /> Retry
                </button>
              </div>
            )}

            {/* Translation Active Alert */}
            {showTranslated && (
              <div style={{
                background: 'rgba(0, 149, 246, 0.08)',
                border: '1px solid rgba(0, 149, 246, 0.25)',
                borderRadius: '10px',
                padding: '9px 14px',
                fontSize: '0.8rem',
                color: '#90a4f2',
                fontWeight: '400',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Globe size={14} />
                <span>English translation active (cached permanently)</span>
              </div>
            )}

            {/* AI Summary & Key Takeaways Card */}
            {(selectedReel.transcript?.summary || (selectedReel.action_items && selectedReel.action_items.length > 0)) && (
              <div style={{
                padding: '20px',
                borderRadius: '16px',
                background: '#181c1f',
                border: '1px solid #282f34',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ fontSize: '0.88rem', fontWeight: '600', color: '#f8fafa' }}>
                  AI Summary & Key Takeaways
                </div>

                {selectedReel.transcript?.summary && (
                  <p style={{ fontSize: '0.92rem', color: '#f8fafa', lineHeight: '1.65', margin: 0, fontWeight: '400' }}>
                    {renderWithClickableLinks(showTranslated && selectedReel.transcript?.translated_summary ? selectedReel.transcript.translated_summary : selectedReel.transcript.summary)}
                  </p>
                )}

                {selectedReel.transcript?.key_points?.length > 0 && !showTranslated && (
                  <ul style={{ paddingLeft: '18px', fontSize: '0.88rem', color: '#d4d4d8', lineHeight: '1.65', margin: 0 }}>
                    {selectedReel.transcript.key_points.map((pt, i) => (
                      <li key={i} style={{ marginBottom: '4px' }}>{renderWithClickableLinks(pt)}</li>
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
                      marginTop: '6px',
                      paddingTop: '12px',
                      borderTop: '1px solid #282f34'
                    }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: '600', color: '#f8fafa', marginBottom: '8px' }}>
                        Extracted Tools & Action Steps:
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {validActions.map((act, i) => (
                          <div key={i} style={{ fontSize: '0.86rem', color: '#f8fafa', display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
                            <span style={{ color: '#90a4f2' }}>•</span>
                            <span>{renderWithClickableLinks(act)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Word-For-Word Full Transcript Card */}
            <div style={{
              padding: '20px',
              borderRadius: '16px',
              background: '#181c1f',
              border: '1px solid #282f34',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: '0.9rem', fontWeight: '600', color: '#f8fafa' }}>
                    Word-for-Word Transcript
                  </span>
                  {showTranslated && (
                    <span style={{ marginLeft: '8px', fontSize: '0.74rem', color: '#90a4f2', fontWeight: '500' }}>
                      (English Translation)
                    </span>
                  )}
                </div>

                {/* Clean Copy Button in Transcription Area */}
                <button
                  type="button"
                  onClick={() => copyText(
                    showTranslated 
                      ? (selectedReel.transcript?.translated_text || selectedReel.transcript?.full_text || '') 
                      : (selectedReel.transcript?.full_text || selectedReel.preview_text || '')
                  )}
                  style={{
                    background: '#121518',
                    border: '1px solid #282f34',
                    color: copied ? '#10b981' : '#f8fafa',
                    borderRadius: '8px',
                    padding: '6px 12px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.8rem',
                    fontWeight: '500',
                    transition: 'all 0.15s ease'
                  }}
                  title="Copy full transcript"
                >
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>

              <div style={{
                maxHeight: '380px',
                overflowY: 'auto',
                padding: '16px',
                borderRadius: '10px',
                background: '#121518',
                border: '1px solid #282f34',
                color: '#f8fafa',
                fontSize: '0.88rem',
                lineHeight: '1.7',
                whiteSpace: 'pre-wrap',
                fontWeight: '400'
              }}>
                {showTranslated 
                  ? (selectedReel.transcript?.translated_text || selectedReel.transcript?.full_text || 'No translation available.')
                  : (selectedReel.transcript?.full_text || selectedReel.preview_text || 'Transcription processing...')}
              </div>

              {/* Translation Controls Below Transcription */}
              {selectedReel.transcript && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingTop: '4px' }}>
                  {selectedReel.transcript.translated_text ? (
                    <button
                      type="button"
                      onClick={() => setShowTranslated(!showTranslated)}
                      style={{
                        fontSize: '0.82rem',
                        padding: '7px 14px',
                        borderRadius: '8px',
                        background: showTranslated ? 'rgba(144, 164, 242, 0.15)' : '#121518',
                        border: showTranslated ? '1px solid #90a4f2' : '1px solid #282f34',
                        color: showTranslated ? '#90a4f2' : '#f8fafa',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Globe size={14} color={showTranslated ? "#90a4f2" : "#f8fafa"} />
                      <span>{showTranslated ? 'Viewing English Translation' : 'Translate to English'}</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleTranslateReel(selectedReel.id)}
                      disabled={translating}
                      style={{
                        fontSize: '0.82rem',
                        padding: '7px 14px',
                        borderRadius: '8px',
                        background: '#121518',
                        border: '1px solid #282f34',
                        color: '#f8fafa',
                        fontWeight: '500',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        cursor: translating ? 'wait' : 'pointer',
                        opacity: translating ? 0.7 : 1,
                        transition: 'all 0.15s ease'
                      }}
                    >
                      <Languages size={14} color="#90a4f2" />
                      <span>{translating ? 'Translating audio...' : 'Translate to English'}</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* SHADCN SPOTLIGHT COMMAND PALETTE (⌘K / Ctrl+K) */}
      {/* ======================================================== */}
      <CommandDialog open={commandOpen} onOpenChange={setCommandOpen}>
        <CommandInput placeholder="Search saved reels, tools, folders, or creators..." />
        <CommandList className="max-h-[420px] p-2 space-y-1">
          <CommandEmpty className="py-10 text-center text-sm text-zinc-400">
            <div className="text-2xl mb-2">🔍</div>
            <div className="font-medium text-zinc-300">No matching reels or collections</div>
            <div className="text-xs text-zinc-500 mt-1">Try searching by topic, category, or creator</div>
          </CommandEmpty>

          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={() => {
                setActiveTab('chat');
                setCommandOpen(false);
              }}
              className="cursor-pointer py-2.5 px-3 rounded-xl flex items-center justify-between hover:bg-[#1a2026] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Sparkles className="h-3.5 w-3.5" />
                </div>
                <div>
                  <div className="font-medium text-sm text-zinc-100">Ask Dex AI Copilot</div>
                  <div className="text-[11px] text-zinc-400">Synthesize answers across your saved reels</div>
                </div>
              </div>
              <CommandShortcut className="bg-[#181d22] border border-[#2e363e] px-1.5 py-0.5 rounded text-[10px] text-zinc-400">↵</CommandShortcut>
            </CommandItem>

            <CommandItem
              onSelect={() => {
                setActiveTab('vault');
                setActiveViewFilter('All');
                setSelectedCollection(null);
                setCommandOpen(false);
              }}
              className="cursor-pointer py-2 px-3 rounded-xl flex items-center justify-between hover:bg-[#1a2026] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <Layers className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-sm text-zinc-200">Browse All Saved Reels</span>
              </div>
            </CommandItem>

            <CommandItem
              onSelect={() => {
                setShowCreateCollectionModal(true);
                setCommandOpen(false);
              }}
              className="cursor-pointer py-2 px-3 rounded-xl flex items-center justify-between hover:bg-[#1a2026] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Plus className="h-3.5 w-3.5" />
                </div>
                <span className="font-medium text-sm text-zinc-200">Create New Collection Folder</span>
              </div>
            </CommandItem>

            <CommandItem
              onSelect={() => {
                handleGeneratePairingCode();
                setCommandOpen(false);
              }}
              className="cursor-pointer py-2 px-3 rounded-xl flex items-center justify-between hover:bg-[#1a2026] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg bg-pink-500/10 border border-pink-500/20 flex items-center justify-center text-pink-400">
                  <InstagramIcon size={14} />
                </div>
                <span className="font-medium text-sm text-zinc-200">Link Instagram Direct</span>
              </div>
            </CommandItem>
          </CommandGroup>

          {collections.length > 0 && (
            <>
              <CommandSeparator className="my-2 bg-[#222830]" />
              <CommandGroup heading="Collections">
                {collections.map(col => (
                  <CommandItem
                    key={col.id}
                    onSelect={() => {
                      setActiveTab('vault');
                      setSelectedCollection(col);
                      setCommandOpen(false);
                    }}
                    className="cursor-pointer py-2 px-3 rounded-xl flex items-center justify-between hover:bg-[#1a2026] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-base">{col.emoji || '📁'}</span>
                      <span className="font-medium text-sm text-zinc-200">{col.name}</span>
                    </div>
                    <span className="text-xs text-zinc-500 font-mono bg-[#161a1f] px-2 py-0.5 rounded-full border border-[#242c34]">
                      {col.count || 0} reels
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {reels.length > 0 && (
            <>
              <CommandSeparator className="my-2 bg-[#222830]" />
              <CommandGroup heading="Saved Reels">
                {reels.slice(0, 40).map(r => {
                  const rawAuthor = r.author || r.sender_username || 'Creator';
                  const cleanAuthor = rawAuthor.split(/[|\-\/]/)[0].trim().replace(/^@/, '');
                  const shortAuthor = cleanAuthor.length > 14 ? cleanAuthor.slice(0, 14) + '…' : cleanAuthor;

                  return (
                    <CommandItem
                      key={r.id}
                      onSelect={() => {
                        setSelectedReel(r);
                        setCommandOpen(false);
                      }}
                      className="cursor-pointer py-2.5 px-3 rounded-xl flex items-center justify-between gap-4 hover:bg-[#1a2026] transition-colors"
                    >
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-lg bg-[#181d22] border border-[#262e36] flex items-center justify-center shrink-0">
                          <Play className="h-3.5 w-3.5 text-zinc-300 fill-zinc-300/30" />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-medium text-sm text-zinc-100 truncate">
                            {r.title || `Reel by @${cleanAuthor}`}
                          </span>
                          {r.summary && (
                            <span className="text-[11px] text-zinc-400 truncate">
                              {typeof r.summary === 'string' ? r.summary : (r.summary.main_topic || '')}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {r.category && (
                          <span className="text-[11px] font-medium py-0.5 px-2 rounded-full bg-[#181d22] border border-[#28323c] text-zinc-300">
                            {r.category}
                          </span>
                        )}
                        <span className="text-xs text-zinc-500 font-mono hidden sm:inline">
                          @{shortAuthor}
                        </span>
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}
        </CommandList>

        {/* Raycast-style keyboard footer */}
        <div className="border-t border-[#222830] px-4 py-2 bg-[#0c0f12] flex items-center justify-between text-[11px] text-zinc-500 rounded-b-2xl">
          <div className="flex items-center gap-3">
            <span><strong className="text-zinc-300 font-normal">↑↓</strong> Navigate</span>
            <span><strong className="text-zinc-300 font-normal">↵</strong> Open</span>
            <span><strong className="text-zinc-300 font-normal">ESC</strong> Close</span>
          </div>
          <div>
            <span>{reels.length} saved reels</span>
          </div>
        </div>
      </CommandDialog>

      {/* ======================================================== */}
      {/* SHADCN FLUID TOASTER */}
      {/* ======================================================== */}
      <Toaster position="bottom-right" richColors />
    </div>
  </TooltipProvider>
  );
}
