import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './Dashboard.css';
import { useAuth } from '../context/AuthContext';
import type { CaptchaData } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { storageService, MAX_SCORES_PER_USER } from '../services/StorageService';
import { createDefaultScore } from '../context/ScoreContext';
import { formatRelativeTime } from '../services/CloudSyncService';
import type { FolderItem, ScoreMeta } from '../types/storage';
import { STANDARD_15_KEYS } from '../types';

export const Dashboard = () => {
  const navigate = useNavigate();
  const { currentUser, isAuthenticated, login, register, sendEmailCode, logout, stats, refreshStats, cloudStatus, syncPush, syncPull, getCaptcha } = useAuth();
  const { showToast } = useToast();

  // Active view: 'all' | 'favorites' | 'recent' | 'trash'
  const [activeTab, setActiveTab] = useState<'all' | 'favorites' | 'recent' | 'trash'>('all');
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'updated' | 'created' | 'title'>('updated');

  // Data lists
  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [scores, setScores] = useState<ScoreMeta[]>([]);

  // Modals state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authInputName, setAuthInputName] = useState('');
  const [authInputEmail, setAuthInputEmail] = useState('');
  const [authEmailCode, setAuthEmailCode] = useState('');
  const [authInputPassword, setAuthInputPassword] = useState('');
  const authAvatar = '🎵';
  const [authError, setAuthError] = useState<string | null>(null);
  const [captchaData, setCaptchaData] = useState<CaptchaData | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [showSpamHint, setShowSpamHint] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  const [showNewScoreModal, setShowNewScoreModal] = useState(false);
  const [newScoreTitle, setNewScoreTitle] = useState('');
  const [newScoreKey, setNewScoreKey] = useState('1=C');
  const [newScoreTime, setNewScoreTime] = useState('4/4');

  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename'>('create');
  const [folderInputName, setFolderInputName] = useState('');
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);

  const [showRenameScoreModal, setShowRenameScoreModal] = useState(false);
  const [renameScoreId, setRenameScoreId] = useState<string | null>(null);
  const [renameScoreTitle, setRenameScoreTitle] = useState('');

  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveScoreId, setMoveScoreId] = useState<string | null>(null);
  const [selectedTargetFolderId, setSelectedTargetFolderId] = useState<string | null>(null);

  // Custom confirmation dialog (replaces window.confirm)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText?: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Active dropdown menu for an item
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Load data
  const loadData = useCallback(() => {
    const allFolders = storageService.getFolders(currentUser.id);
    const allScores = storageService.getAllScores(currentUser.id);
    setFolders(allFolders);
    setScores(allScores);
    refreshStats();
  }, [currentUser.id, refreshStats]);

  useEffect(() => {
    loadData();
    if (currentUser.isCloudUser) {
      syncPull().then(() => loadData()).catch(() => {});
    }
  }, [currentUser.id, currentUser.isCloudUser, syncPull, loadData]);

  const triggerCloudSync = useCallback(() => {
    if (currentUser.isCloudUser) {
      syncPush().catch(() => {});
    }
  }, [currentUser.isCloudUser, syncPush]);


  // Close menus on click outside
  useEffect(() => {
    const handleClickOutside = () => setActiveMenuId(null);
    window.addEventListener('click', handleClickOutside);
    return () => window.removeEventListener('click', handleClickOutside);
  }, []);

  // Compute breadcrumbs
  const breadcrumbs = useMemo(() => {
    if (!currentFolderId) return [];
    const crumbs: { id: string; name: string }[] = [];
    let curId: string | null = currentFolderId;
    while (curId) {
      const f = folders.find(item => item.id === curId);
      if (f) {
        crumbs.unshift({ id: f.id, name: f.name });
        curId = f.parentId;
      } else {
        break;
      }
    }
    return crumbs;
  }, [currentFolderId, folders]);

  // Filtered folders in current folder (only shown in 'all' view)
  const currentSubFolders = useMemo(() => {
    if (activeTab !== 'all' || searchQuery.trim()) return [];
    return folders.filter(f => f.parentId === currentFolderId);
  }, [folders, currentFolderId, activeTab, searchQuery]);

  // Filtered and sorted scores
  const displayedScores = useMemo(() => {
    let list: ScoreMeta[] = [];

    if (activeTab === 'trash') {
      list = scores.filter(s => s.isDeleted);
    } else if (activeTab === 'favorites') {
      list = scores.filter(s => !s.isDeleted && s.isFavorite);
    } else if (activeTab === 'recent') {
      list = scores.filter(s => !s.isDeleted);
    } else {
      // 'all'
      if (searchQuery.trim()) {
        list = scores.filter(s => !s.isDeleted);
      } else {
        list = scores.filter(s => !s.isDeleted && s.folderId === currentFolderId);
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(s => 
        s.title.toLowerCase().includes(q) || 
        (s.subtitle && s.subtitle.toLowerCase().includes(q)) ||
        (s.author && s.author.toLowerCase().includes(q))
      );
    }

    // Sort
    return [...list].sort((a, b) => {
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title, 'zh-CN');
      } else if (sortBy === 'created') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      } else {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
    });
  }, [scores, activeTab, currentFolderId, searchQuery, sortBy]);

  // --- Handlers ---
  const handleCreateScore = () => {
    if (!newScoreTitle.trim()) return;
    const initialData = createDefaultScore(newScoreTitle.trim(), newScoreKey, newScoreTime);
    const newMeta = storageService.saveScore(initialData, undefined, currentFolderId, currentUser.id);
    setShowNewScoreModal(false);
    setNewScoreTitle('');
    showToast(`《${newMeta.title}》已创建`, 'success');
    navigate(`/editor/${newMeta.id}?title=${encodeURIComponent(newMeta.title)}`);
  };

  const handleCreateFolder = () => {
    if (!folderInputName.trim()) return;
    storageService.createFolder(folderInputName.trim(), currentFolderId, currentUser.id);
    setShowFolderModal(false);
    setFolderInputName('');
    showToast('文件夹已创建', 'success');
    loadData();
    triggerCloudSync();
  };

  const handleRenameFolder = () => {
    if (!targetFolderId || !folderInputName.trim()) return;
    storageService.renameFolder(targetFolderId, folderInputName.trim(), currentUser.id);
    setShowFolderModal(false);
    setFolderInputName('');
    setTargetFolderId(null);
    showToast('文件夹名称已更新', 'success');
    loadData();
    triggerCloudSync();
  };

  const handleDeleteFolder = (folderId: string, folderName: string) => {
    setConfirmDialog({
      isOpen: true,
      title: '删除文件夹',
      message: `确定要删除文件夹「${folderName}」吗？其中的乐谱将被安全移至全部曲谱（根目录），不会丢失。`,
      confirmText: '删除文件夹',
      danger: true,
      onConfirm: () => {
        storageService.deleteFolder(folderId, currentUser.id);
        if (currentFolderId === folderId) {
          setCurrentFolderId(null);
        }
        setConfirmDialog(null);
        loadData();
        triggerCloudSync();
        showToast(`文件夹「${folderName}」已删除`, 'info');
      }
    });
  };

  const handleOpenScore = (scoreId: string) => {
    navigate(`/editor/${scoreId}`);
  };

  const handleRenameScoreSubmit = () => {
    if (!renameScoreId || !renameScoreTitle.trim()) return;
    storageService.renameScore(renameScoreId, renameScoreTitle.trim(), currentUser.id);
    setShowRenameScoreModal(false);
    setRenameScoreId(null);
    setRenameScoreTitle('');
    showToast('乐谱名称已更新', 'success');
    loadData();
    triggerCloudSync();
  };

  const handleMoveScoreSubmit = () => {
    if (!moveScoreId) return;
    storageService.moveScore(moveScoreId, selectedTargetFolderId, currentUser.id);
    setShowMoveModal(false);
    setMoveScoreId(null);
    setSelectedTargetFolderId(null);
    showToast('乐谱已移动到指定目录', 'success');
    loadData();
    triggerCloudSync();
  };

  const handleToggleFavorite = (scoreId: string, scoreTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isFav = storageService.toggleFavorite(scoreId, currentUser.id);
    loadData();
    triggerCloudSync();
    showToast(isFav ? `已将《${scoreTitle}》加入收藏` : `已取消收藏《${scoreTitle}》`, 'info');
  };

  const handleMoveToTrash = (scoreId: string, scoreTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    storageService.moveToTrash(scoreId, currentUser.id);
    loadData();
    triggerCloudSync();
    showToast(`《${scoreTitle}》已移入回收站`, 'info');
  };

  const handleRestoreScore = (scoreId: string, scoreTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    storageService.restoreFromTrash(scoreId, currentUser.id);
    loadData();
    triggerCloudSync();
    showToast(`《${scoreTitle}》已从回收站还原`, 'success');
  };

  const handlePermanentDelete = (scoreId: string, scoreTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setConfirmDialog({
      isOpen: true,
      title: '彻底删除乐谱',
      message: `确定要彻底删除《${scoreTitle}》吗？此操作不可逆，乐谱数据将永久清除。`,
      confirmText: '彻底删除',
      danger: true,
      onConfirm: () => {
        storageService.permanentlyDeleteScore(scoreId, currentUser.id);
        setConfirmDialog(null);
        loadData();
        triggerCloudSync();
        showToast(`《${scoreTitle}》已彻底删除`, 'info');
      }
    });
  };

  const handleEmptyTrash = () => {
    setConfirmDialog({
      isOpen: true,
      title: '清空回收站',
      message: '确定要清空回收站吗？回收站内的所有乐谱将被永久清除，不可恢复。',
      confirmText: '清空回收站',
      danger: true,
      onConfirm: () => {
        storageService.emptyTrash(currentUser.id);
        setConfirmDialog(null);
        loadData();
        triggerCloudSync();
        showToast('回收站已清空', 'info');
      }
    });
  };

  const handleDuplicateScore = (scoreId: string, scoreTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const cloned = storageService.duplicateScore(scoreId, currentUser.id);
    loadData();
    triggerCloudSync();
    if (cloned) {
      showToast(`已创建《${scoreTitle}》的副本`, 'success');
    }
  };

  const [authLoading, setAuthLoading] = useState(false);

  const fetchNewCaptcha = useCallback(async () => {
    setCaptchaLoading(true);
    try {
      const data = await getCaptcha();
      setCaptchaData(data);
      setCaptchaAnswer('');
    } catch {
      // 本地离线环境 fallback
      const n1 = Math.floor(Math.random() * 9) + 1;
      const n2 = Math.floor(Math.random() * 9) + 1;
      setCaptchaData({ question: `${n1} + ${n2} = ?`, token: 'offline', timestamp: Date.now() });
    } finally {
      setCaptchaLoading(false);
    }
  }, [getCaptcha]);

  useEffect(() => {
    if (showAuthModal && authMode === 'register') {
      fetchNewCaptcha();
    }
  }, [showAuthModal, authMode, fetchNewCaptcha]);

  // Countdown timer for resend email code
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  const handleSendEmailCode = async () => {
    if (!authInputEmail.trim() || !authInputEmail.includes('@')) {
      setAuthError('请先输入有效的电子邮箱地址');
      return;
    }
    if (!captchaAnswer.trim()) {
      setAuthError('请先完成人机安全验证计算题');
      return;
    }
    setAuthError(null);
    setSendCodeLoading(true);
    try {
      const res = await sendEmailCode(
        authInputEmail.trim(),
        captchaAnswer.trim(),
        captchaData?.token || '',
        captchaData?.timestamp || 0
      );
      setCountdown(60);
      setShowSpamHint(true);
      showToast(res.message || '✅ 验证码已发送！若收件箱未看到，请检查「垃圾箱/垃圾邮件」', 'success', 6000);
      if (res.devHint) {
        showToast(res.devHint, 'info', 6000);
      }
    } catch (err: any) {
      setAuthError(err.message || '发送验证码失败');
      fetchNewCaptcha();
    } finally {
      setSendCodeLoading(false);
    }
  };

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (authMode === 'login') {
      if (!authInputName.trim()) {
        setAuthError('请输入用户名或电子邮箱');
        return;
      }
      if (!authInputPassword) {
        setAuthError('请输入登录密码');
        return;
      }
      setAuthLoading(true);
      try {
        await login(authInputName.trim(), authInputPassword);
        setAuthInputName('');
        setAuthInputPassword('');
        setShowAuthModal(false);
        showToast(`欢迎回来，${authInputName.trim()}！`, 'success');
      } catch (err: any) {
        setAuthError(err.message || '登录失败，请检查用户名或密码');
      } finally {
        setAuthLoading(false);
      }
    } else {
      if (!authInputName.trim()) {
        setAuthError('请输入用户名');
        return;
      }
      if (authInputName.trim().length < 2) {
        setAuthError('用户名长度至少需要2个字符');
        return;
      }
      if (!authInputEmail.trim() || !authInputEmail.includes('@')) {
        setAuthError('请输入有效的电子邮箱');
        return;
      }
      if (!captchaAnswer.trim()) {
        setAuthError('请完成人机安全验证计算');
        return;
      }
      if (!authEmailCode.trim() || authEmailCode.trim().length !== 6) {
        setAuthError('请输入收到的 6 位邮箱验证码（请先点击获取验证码）');
        return;
      }
      if (!authInputPassword || authInputPassword.length < 6) {
        setAuthError('请设置登录密码，密码长度至少需要6位');
        return;
      }

      setAuthLoading(true);
      try {
        await register(
          authInputName.trim(),
          authInputEmail.trim(),
          authEmailCode.trim(),
          authInputPassword,
          captchaAnswer.trim(),
          captchaData?.token || '',
          captchaData?.timestamp || 0,
          authAvatar
        );
        setAuthInputName('');
        setAuthInputEmail('');
        setAuthEmailCode('');
        setAuthInputPassword('');
        setCaptchaAnswer('');
        setShowAuthModal(false);
        showToast(`🎉 欢迎加入！已开启专属云空间（免费额度 ${MAX_SCORES_PER_USER} 首）`, 'success');
      } catch (err: any) {
        setAuthError(err.message || '注册失败，请稍后重试');
        fetchNewCaptcha();
      } finally {
        setAuthLoading(false);
      }
    }
  };


  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      const now = new Date();
      if (d.toDateString() === now.toDateString()) {
        return `今天 ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }
      return `${d.getFullYear()}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getDate().toString().padStart(2, '0')}`;
    } catch {
      return isoString;
    }
  };

  return (
    <div className="easypu-dashboard">
      {/* Sidebar */}
      <aside className="easypu-sidebar">
        <div className="sidebar-brand">
          <div className="brand-logo-badge">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18V5l12-2v13"></path>
              <circle cx="6" cy="18" r="3"></circle>
              <circle cx="18" cy="16" r="3"></circle>
            </svg>
          </div>
          <div className="brand-info">
            <span className="brand-name">Easypu</span>
            <span className="brand-tagline">在线简谱制谱</span>
          </div>
        </div>

        <div className="sidebar-action">
          <button className="btn-new-score" onClick={() => setShowNewScoreModal(true)}>
            <span className="btn-icon">+</span> 新建乐谱
          </button>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section-title">我的乐库</div>
          <button
            className={`nav-link ${activeTab === 'all' ? 'active' : ''}`}
            onClick={() => { setActiveTab('all'); setCurrentFolderId(null); }}
          >
            <span className="nav-icon-badge blue">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
            </span>
            <span className="nav-text">全部曲谱</span>
            <span className="nav-badge">{stats.scoresCount}</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'favorites' ? 'active' : ''}`}
            onClick={() => setActiveTab('favorites')}
          >
            <span className="nav-icon-badge amber">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </span>
            <span className="nav-text">我的收藏</span>
          </button>

          <button
            className={`nav-link ${activeTab === 'recent' ? 'active' : ''}`}
            onClick={() => setActiveTab('recent')}
          >
            <span className="nav-icon-badge emerald">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
            </span>
            <span className="nav-text">最近更新</span>
          </button>

          <div className="nav-divider"></div>

          <button
            className={`nav-link ${activeTab === 'trash' ? 'active' : ''}`}
            onClick={() => setActiveTab('trash')}
          >
            <span className="nav-icon-badge rose">
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </span>
            <span className="nav-text">回收站</span>
            {stats.trashCount > 0 && (
              <span className="nav-badge trash-badge">{stats.trashCount}</span>
            )}
          </button>
        </nav>

        {/* Cloudflare Storage Status Banner */}
        <div className="cloudflare-sync-card">
          <div className="sync-header">
            <span className={`sync-dot ${currentUser.isCloudUser ? 'online' : 'local'}`}></span>
            <span className="sync-title">
              {currentUser.isCloudUser ? 'Cloudflare 云存储空间' : '本地离线体验模式'}
            </span>
          </div>
          <div className="sync-desc">
            {currentUser.isCloudUser
              ? 'D1 + R2 双重持久化已连接'
              : '当前处于本地免注册体验模式'}
          </div>
          {/* Quota Progress: Only show for registered cloud users */}
          {currentUser.isCloudUser ? (
            <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '4px', opacity: 0.85 }}>
                <span>云端曲谱配额</span>
                <span style={{ fontWeight: 600 }}>{stats.scoresCount} / {MAX_SCORES_PER_USER} 首</span>
              </div>
              <div style={{ height: '4px', background: 'rgba(255,255,255,0.12)', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(100, (stats.scoresCount / MAX_SCORES_PER_USER) * 100)}%`,
                  height: '100%',
                  background: stats.scoresCount >= 450 ? '#ef4444' : stats.scoresCount >= 350 ? '#f59e0b' : '#3b82f6',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          ) : (
            <div style={{ marginTop: '6px', fontSize: '11px', opacity: 0.75 }}>
              数据保存在当前浏览器本地缓存
            </div>
          )}
        </div>

        {/* User Profile */}
        <div className="sidebar-footer">
          <div className="user-profile-widget" onClick={() => setShowAuthModal(true)} style={{ cursor: 'pointer' }}>
            <div className="user-avatar">{currentUser.avatar || '👤'}</div>
            <div className="user-meta">
              <div className="user-name-row">
                <span className="user-name">{currentUser.username}</span>
                {currentUser.isCloudUser ? (
                  <span className="user-type-badge cloud" title="已绑定 Cloudflare R2 云存储">☁️ R2</span>
                ) : (
                  <span className="user-type-badge local" title="本地离线体验模式">💾 本地</span>
                )}
              </div>
              <div className="user-email">{currentUser.email}</div>
            </div>
          </div>

          {/* Cloud Sync Widget */}
          {isAuthenticated && currentUser.isCloudUser ? (
            <div className="cloud-sync-widget" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: '8px', marginTop: '8px' }}>
              <div className="cloud-sync-status" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span className={`cloud-sync-icon ${cloudStatus.syncing ? 'spinning' : ''}`} style={{ fontSize: '13px', color: '#10b981' }}>
                  {cloudStatus.syncing ? '⟳' : '☁'}
                </span>
                <span className="cloud-sync-time" style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {cloudStatus.syncing
                    ? '云端数据同步中...'
                    : cloudStatus.lastError
                    ? `⚠ ${cloudStatus.lastError}`
                    : `云端已同步 · ${formatRelativeTime(cloudStatus.updatedAt)}`}
                </span>
              </div>
            </div>
          ) : (
            <div className="cloud-sync-hint" onClick={() => { setAuthMode('register'); setShowAuthModal(true); }} style={{ cursor: 'pointer', marginTop: '8px', padding: '8px 12px', background: 'rgba(59,130,246,0.08)', borderRadius: '8px', border: '1px dashed rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="cloud-hint-icon" style={{ fontSize: '14px' }}>☁️</span>
              <span className="cloud-hint-text" style={{ fontSize: '11px', color: 'var(--primary-color)' }}>
                当前为本地体验，点击免费注册开启云端存储
              </span>
            </div>
          )}

          <div className="user-actions">
            {isAuthenticated ? (
              <button className="user-btn outline" onClick={() => { logout(); showToast('已退出当前账号，切换至默认体验模式', 'info'); }} title="退出当前账号">
                退出登录
              </button>
            ) : (
              <button className="user-btn primary" onClick={() => setShowAuthModal(true)}>
                登录 / 注册云空间账号
              </button>
            )}
          </div>
        </div>
      </aside>


      {/* Main Content Area */}
      <main className="easypu-main">
        {/* Top Header Bar */}
        <header className="dashboard-topbar">
          <div className="topbar-search">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="搜索乐谱标题、作者、副标题..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="clear-search-btn" onClick={() => setSearchQuery('')}>✕</button>
            )}
          </div>

          <div className="topbar-actions">
            {activeTab === 'all' && (
              <button
                className="topbar-btn secondary"
                onClick={() => {
                  setFolderModalMode('create');
                  setFolderInputName('');
                  setShowFolderModal(true);
                }}
              >
                📁 新建文件夹
              </button>
            )}

            <div className="sort-select-wrapper">
              <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}>
                <option value="updated">按更新时间</option>
                <option value="created">按创建时间</option>
                <option value="title">按名称排序</option>
              </select>
            </div>

            <div className="view-toggle">
              <button
                className={`toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setViewMode('grid')}
                title="网格视图"
              >
                ▦
              </button>
              <button
                className={`toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                onClick={() => setViewMode('list')}
                title="列表视图"
              >
                ☰
              </button>
            </div>
          </div>
        </header>

        {/* Navigation Breadcrumbs & View Title */}
        <section className="dashboard-subbar">
          <div className="breadcrumbs-area">
            {activeTab === 'all' ? (
              <div className="breadcrumbs">
                <span
                  className={`crumb-link ${currentFolderId === null ? 'current' : ''}`}
                  onClick={() => setCurrentFolderId(null)}
                >
                  全部曲谱
                </span>
                {breadcrumbs.map((crumb, idx) => (
                  <span key={crumb.id} className="crumb-segment">
                    <span className="crumb-sep">/</span>
                    <span
                      className={`crumb-link ${idx === breadcrumbs.length - 1 ? 'current' : ''}`}
                      onClick={() => setCurrentFolderId(crumb.id)}
                    >
                      {crumb.name}
                    </span>
                  </span>
                ))}
              </div>
            ) : activeTab === 'favorites' ? (
              <h2 className="view-heading">⭐ 我的收藏 ({displayedScores.length})</h2>
            ) : activeTab === 'recent' ? (
              <h2 className="view-heading">🕒 最近更新 ({displayedScores.length})</h2>
            ) : (
              <div className="trash-heading-bar">
                <h2 className="view-heading">🗑️ 回收站 ({displayedScores.length})</h2>
                {displayedScores.length > 0 && (
                  <button className="btn-empty-trash" onClick={handleEmptyTrash}>
                    清空回收站
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Folders Section (Only in 'all' view) */}
        {activeTab === 'all' && currentSubFolders.length > 0 && (
          <section className="folders-section">
            <h3 className="section-label">文件夹 ({currentSubFolders.length})</h3>
            <div className="folders-grid">
              {currentSubFolders.map(folder => {
                const count = scores.filter(s => !s.isDeleted && s.folderId === folder.id).length;
                return (
                  <div
                    key={folder.id}
                    className="folder-card"
                    onClick={() => setCurrentFolderId(folder.id)}
                  >
                    <div className="folder-card-left">
                      <div className="folder-icon-badge">
                        <svg viewBox="0 0 24 24" width="22" height="22" fill="#f59e0b" stroke="#d97706" strokeWidth="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                      </div>
                      <div className="folder-details">
                        <span className="folder-title" title={folder.name}>{folder.name}</span>
                        <span className="folder-count">{count} 份乐谱</span>
                      </div>
                    </div>
                    <div className="folder-card-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="folder-opt-btn"
                        onClick={() => {
                          setFolderModalMode('rename');
                          setTargetFolderId(folder.id);
                          setFolderInputName(folder.name);
                          setShowFolderModal(true);
                        }}
                        title="重命名文件夹"
                      >
                        ✏️
                      </button>
                      <button
                        className="folder-opt-btn delete"
                        onClick={() => handleDeleteFolder(folder.id, folder.name)}
                        title="删除文件夹"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* Scores List / Grid */}
        <section className="scores-content-section">
          {activeTab === 'all' && currentSubFolders.length > 0 && displayedScores.length > 0 && (
            <h3 className="section-label">乐谱文件 ({displayedScores.length})</h3>
          )}

          {displayedScores.length === 0 && currentSubFolders.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">{activeTab === 'trash' ? '🗑️' : '🎼'}</div>
              <h3 className="empty-title">
                {activeTab === 'trash'
                  ? '回收站为空'
                  : searchQuery
                  ? '未找到匹配的乐谱'
                  : '此目录下暂无乐谱'}
              </h3>
              <p className="empty-desc">
                {activeTab === 'trash'
                  ? '删除的乐谱会在这里保留，您可以随时恢复。'
                  : '点击上方“+ 新建乐谱”开始制作您的简谱作品吧！'}
              </p>
              {activeTab !== 'trash' && !searchQuery && (
                <button className="btn-primary-large" onClick={() => setShowNewScoreModal(true)}>
                  + 新建简谱
                </button>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            /* Grid Cards View */
            <div className="scores-grid">
              {displayedScores.map(score => (
                <div
                  key={score.id}
                  className={`score-card ${score.isFavorite ? 'favorite' : ''} ${activeMenuId === score.id ? 'menu-open' : ''}`}
                  onClick={() => activeTab !== 'trash' && handleOpenScore(score.id)}
                >
                  <div className="card-top">
                    <div className="score-badge-area">
                      <span className="card-key-tag">{score.keySignature || '1=C'}</span>
                      <span className="card-time-tag">{score.timeSignature || '4/4'}</span>
                      {score.measuresCount !== undefined && (
                        <span className="card-measures-tag">{score.measuresCount} 小节</span>
                      )}
                    </div>
                    {activeTab !== 'trash' && (
                      <button
                        className={`fav-star-btn ${score.isFavorite ? 'active' : ''}`}
                        onClick={e => handleToggleFavorite(score.id, score.title, e)}
                        title={score.isFavorite ? '取消收藏' : '收藏乐谱'}
                      >
                        ★
                      </button>
                    )}
                  </div>

                  <div className="card-body">
                    <h4 className="score-card-title" title={score.title}>{score.title}</h4>
                    {score.subtitle && <p className="score-card-sub">{score.subtitle}</p>}
                    {score.author && <p className="score-card-author">作词/作曲: {score.author}</p>}
                  </div>

                  <div className="card-footer">
                    <span className="score-date">
                      {activeTab === 'trash'
                        ? `删除于: ${formatDate(score.deletedAt || score.updatedAt)}`
                        : `更新: ${formatDate(score.updatedAt)}`}
                    </span>

                    <div className="score-menu-container" onClick={e => e.stopPropagation()}>
                      <button
                        className="menu-trigger-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveMenuId(activeMenuId === score.id ? null : score.id);
                        }}
                        title="更多操作"
                      >
                        ···
                      </button>

                      {activeMenuId === score.id && (
                        <div className="score-dropdown-menu">
                          {activeTab !== 'trash' ? (
                            <>
                              <button onClick={() => { setActiveMenuId(null); handleOpenScore(score.id); }}>
                                ✏️ 编辑乐谱
                              </button>
                              <button onClick={() => {
                                setActiveMenuId(null);
                                setRenameScoreId(score.id);
                                setRenameScoreTitle(score.title);
                                setShowRenameScoreModal(true);
                              }}>
                                🏷️ 重命名
                              </button>
                              <button onClick={() => {
                                setActiveMenuId(null);
                                setMoveScoreId(score.id);
                                setSelectedTargetFolderId(score.folderId);
                                setShowMoveModal(true);
                              }}>
                                📦 移动到文件夹
                              </button>
                              <button onClick={() => { setActiveMenuId(null); handleDuplicateScore(score.id, score.title); }}>
                                📋 创建副本
                              </button>
                              <div className="dropdown-divider"></div>
                              <button className="danger" onClick={() => { setActiveMenuId(null); handleMoveToTrash(score.id, score.title); }}>
                                🗑️ 移入回收站
                              </button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setActiveMenuId(null); handleRestoreScore(score.id, score.title); }}>
                                ↩️ 还原乐谱
                              </button>
                              <button className="danger" onClick={() => { setActiveMenuId(null); handlePermanentDelete(score.id, score.title); }}>
                                ❌ 彻底删除
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Table List View */
            <div className="scores-table-wrapper">
              <table className="scores-table">
                <thead>
                  <tr>
                    <th style={{ width: '40%' }}>乐谱名称</th>
                    <th>调号/拍号</th>
                    <th>小节数</th>
                    <th>更新时间</th>
                    <th style={{ width: '140px', textAlign: 'right' }}>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedScores.map(score => (
                    <tr
                      key={score.id}
                      onClick={() => activeTab !== 'trash' && handleOpenScore(score.id)}
                      className="score-row"
                    >
                      <td>
                        <div className="table-title-cell">
                          <span className="file-icon">📄</span>
                          <div className="table-title-info">
                            <span className="table-title-text">{score.title}</span>
                            {score.author && <span className="table-author-text">{score.author}</span>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="table-tag">{score.keySignature || '1=C'}</span>{' '}
                        <span className="table-tag">{score.timeSignature || '4/4'}</span>
                      </td>
                      <td>{score.measuresCount || 0}</td>
                      <td>{formatDate(score.updatedAt)}</td>
                      <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                        <div className="table-row-actions">
                          {activeTab !== 'trash' ? (
                            <>
                              <button
                                className="action-icon-btn"
                                onClick={() => handleOpenScore(score.id)}
                                title="编辑乐谱"
                              >
                                ✏️
                              </button>
                              <button
                                className="action-icon-btn"
                                onClick={(e) => handleToggleFavorite(score.id, score.title, e)}
                                title={score.isFavorite ? '取消收藏' : '收藏'}
                              >
                                {score.isFavorite ? '★' : '☆'}
                              </button>
                              <div className="score-menu-container">
                                <button
                                  className="action-icon-btn menu-btn"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveMenuId(activeMenuId === `tbl_${score.id}` ? null : `tbl_${score.id}`);
                                  }}
                                  title="更多操作"
                                >
                                  ···
                                </button>
                                {activeMenuId === `tbl_${score.id}` && (
                                  <div className="score-dropdown-menu table-menu">
                                    <button onClick={() => { setActiveMenuId(null); handleOpenScore(score.id); }}>
                                      ✏️ 编辑乐谱
                                    </button>
                                    <button onClick={() => {
                                      setActiveMenuId(null);
                                      setRenameScoreId(score.id);
                                      setRenameScoreTitle(score.title);
                                      setShowRenameScoreModal(true);
                                    }}>
                                      🏷️ 重命名
                                    </button>
                                    <button onClick={() => {
                                      setActiveMenuId(null);
                                      setMoveScoreId(score.id);
                                      setSelectedTargetFolderId(score.folderId);
                                      setShowMoveModal(true);
                                    }}>
                                      📦 移动到文件夹
                                    </button>
                                    <button onClick={() => { setActiveMenuId(null); handleDuplicateScore(score.id, score.title); }}>
                                      📋 创建副本
                                    </button>
                                    <div className="dropdown-divider"></div>
                                    <button className="danger" onClick={() => { setActiveMenuId(null); handleMoveToTrash(score.id, score.title); }}>
                                      🗑️ 移入回收站
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              <button
                                className="action-icon-btn"
                                onClick={() => handleRestoreScore(score.id, score.title)}
                                title="还原"
                              >
                                ↩️
                              </button>
                              <button
                                className="action-icon-btn danger"
                                onClick={() => handlePermanentDelete(score.id, score.title)}
                                title="彻底删除"
                              >
                                ❌
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      {/* --- MODALS --- */}

      {/* 1. Custom Beautiful Confirm Dialog */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="modal-backdrop" onClick={() => setConfirmDialog(null)}>
          <div className="modal-box small confirm-dialog-box" onClick={e => e.stopPropagation()}>
            <div className="confirm-icon-wrapper">
              <span className={`confirm-icon ${confirmDialog.danger ? 'danger' : 'info'}`}>
                {confirmDialog.danger ? '⚠️' : 'ℹ️'}
              </span>
            </div>
            <div className="confirm-body">
              <h3 className="confirm-title">{confirmDialog.title}</h3>
              <p className="confirm-message">{confirmDialog.message}</p>
            </div>
            <div className="confirm-actions">
              <button className="btn-cancel" onClick={() => setConfirmDialog(null)}>
                {confirmDialog.cancelText || '取消'}
              </button>
              <button
                className={`btn-confirm ${confirmDialog.danger ? 'danger' : ''}`}
                onClick={confirmDialog.onConfirm}
              >
                {confirmDialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. New Score Modal */}
      {showNewScoreModal && (
        <div className="modal-backdrop" onClick={() => setShowNewScoreModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>新建简谱</h3>
              <button className="modal-close-btn" onClick={() => setShowNewScoreModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>乐谱标题</label>
                <input
                  type="text"
                  placeholder="请输入乐谱名称，如《早安世界》"
                  value={newScoreTitle}
                  onChange={e => setNewScoreTitle(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreateScore()}
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>调号</label>
                  <select value={newScoreKey} onChange={e => setNewScoreKey(e.target.value)}>
                    {STANDARD_15_KEYS.map(k => (
                      <option key={k.value} value={k.value}>
                        {k.label} - {k.desc}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label>拍号</label>
                  <select value={newScoreTime} onChange={e => setNewScoreTime(e.target.value)}>
                    <option value="4/4">4/4 拍</option>
                    <option value="2/4">2/4 拍</option>
                    <option value="3/4">3/4 拍</option>
                    <option value="6/8">6/8 拍</option>
                    <option value="3/8">3/8 拍</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowNewScoreModal(false)}>取消</button>
              <button className="btn-confirm" onClick={handleCreateScore} disabled={!newScoreTitle.trim()}>
                创建并进入编辑
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Folder Modal (Create / Rename) */}
      {showFolderModal && (
        <div className="modal-backdrop" onClick={() => setShowFolderModal(false)}>
          <div className="modal-box small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{folderModalMode === 'create' ? '新建文件夹' : '重命名文件夹'}</h3>
              <button className="modal-close-btn" onClick={() => setShowFolderModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>文件夹名称</label>
                <input
                  type="text"
                  placeholder="请输入文件夹名称"
                  value={folderInputName}
                  onChange={e => setFolderInputName(e.target.value)}
                  autoFocus
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (folderModalMode === 'create') {
                        handleCreateFolder();
                      } else {
                        handleRenameFolder();
                      }
                    }
                  }}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowFolderModal(false)}>取消</button>
              <button
                className="btn-confirm"
                onClick={folderModalMode === 'create' ? handleCreateFolder : handleRenameFolder}
                disabled={!folderInputName.trim()}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Rename Score Modal */}
      {showRenameScoreModal && (
        <div className="modal-backdrop" onClick={() => setShowRenameScoreModal(false)}>
          <div className="modal-box small" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>重命名乐谱</h3>
              <button className="modal-close-btn" onClick={() => setShowRenameScoreModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>新乐谱名称</label>
                <input
                  type="text"
                  placeholder="请输入新名称"
                  value={renameScoreTitle}
                  onChange={e => setRenameScoreTitle(e.target.value)}
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleRenameScoreSubmit()}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowRenameScoreModal(false)}>取消</button>
              <button
                className="btn-confirm"
                onClick={handleRenameScoreSubmit}
                disabled={!renameScoreTitle.trim()}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Move Score Modal */}
      {showMoveModal && (
        <div className="modal-backdrop" onClick={() => setShowMoveModal(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>移动乐谱到文件夹</h3>
              <button className="modal-close-btn" onClick={() => setShowMoveModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="move-dialog-desc">请选择目标存放目录：</p>
              <div className="folder-selection-list">
                <div
                  className={`folder-select-item ${selectedTargetFolderId === null ? 'selected' : ''}`}
                  onClick={() => setSelectedTargetFolderId(null)}
                >
                  <span className="folder-icon">📁</span>
                  <span className="folder-name">全部曲谱 (根目录)</span>
                </div>
                {folders.map(f => (
                  <div
                    key={f.id}
                    className={`folder-select-item ${selectedTargetFolderId === f.id ? 'selected' : ''}`}
                    onClick={() => setSelectedTargetFolderId(f.id)}
                  >
                    <span className="folder-icon">📁</span>
                    <span className="folder-name">{f.name}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-cancel" onClick={() => setShowMoveModal(false)}>取消</button>
              <button className="btn-confirm" onClick={handleMoveScoreSubmit}>
                移动到此处
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Login / Register Modal */}
      {showAuthModal && (
        <div className="modal-backdrop" onClick={() => setShowAuthModal(false)}>
          <div className="modal-box auth-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="auth-tabs">
                <button
                  className={`auth-tab ${authMode === 'login' ? 'active' : ''}`}
                  onClick={() => { setAuthMode('login'); setAuthError(null); }}
                >
                  账号登录
                </button>
                <button
                  className={`auth-tab ${authMode === 'register' ? 'active' : ''}`}
                  onClick={() => { setAuthMode('register'); setAuthError(null); }}
                >
                  注册云空间账号
                </button>
              </div>
              <button className="modal-close-btn" onClick={() => setShowAuthModal(false)}>✕</button>
            </div>

            <form onSubmit={handleAuthSubmit}>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {authError && (
                  <div className="auth-error-banner" style={{ marginBottom: '14px' }}>
                    ⚠️ {authError}
                  </div>
                )}

                <div className="form-group">
                  <label>{authMode === 'login' ? '用户名或电子邮箱' : '设置用户名'} <span className="required-tag">*必填</span></label>
                  <input
                    type="text"
                    placeholder={authMode === 'login' ? '请输入用户名或邮箱' : '请输入用户名（至少2位）'}
                    value={authInputName}
                    onChange={e => { setAuthInputName(e.target.value); setAuthError(null); }}
                    required
                    autoFocus
                  />
                </div>

                {authMode === 'register' && (
                  <>
                    <div className="form-group">
                      <label>电子邮箱 <span className="required-tag">*用于接收验证码</span></label>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <input
                          type="email"
                          placeholder="yourname@example.com"
                          value={authInputEmail}
                          onChange={e => { setAuthInputEmail(e.target.value); setAuthError(null); }}
                          style={{ flex: 1 }}
                          required
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={handleSendEmailCode}
                          disabled={sendCodeLoading || countdown > 0}
                          style={{
                            padding: '8px 12px',
                            fontSize: '13px',
                            whiteSpace: 'nowrap',
                            cursor: (sendCodeLoading || countdown > 0) ? 'not-allowed' : 'pointer',
                            minWidth: '105px',
                            background: countdown > 0 ? '#f1f5f9' : '#3b82f6',
                            color: countdown > 0 ? '#64748b' : '#ffffff',
                            border: 'none',
                            borderRadius: '6px',
                            fontWeight: 600
                          }}
                        >
                          {sendCodeLoading ? '发送中...' : countdown > 0 ? `${countdown}s 后重试` : '发送验证码'}
                        </button>
                      </div>
                    </div>

                    <div className="form-group">
                      <label>
                        人机安全验证 <span className="required-tag">*必填</span>
                      </label>
                      <div className="captcha-row" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <div
                          className="captcha-badge"
                          style={{
                            background: 'var(--bg-secondary)',
                            padding: '6px 10px',
                            borderRadius: '6px',
                            fontWeight: 'bold',
                            fontSize: '14px',
                            letterSpacing: '1px',
                            border: '1px solid var(--border-color)',
                            userSelect: 'none',
                            minWidth: '95px',
                            textAlign: 'center',
                          }}
                        >
                          {captchaLoading ? '加载中...' : (captchaData?.question || '计算题目')}
                        </div>
                        <input
                          type="text"
                          placeholder="请输入计算结果"
                          value={captchaAnswer}
                          onChange={e => { setCaptchaAnswer(e.target.value); setAuthError(null); }}
                          style={{ flex: 1 }}
                          required
                        />
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={fetchNewCaptcha}
                          style={{ padding: '6px 10px', fontSize: '12px', whiteSpace: 'nowrap', cursor: 'pointer' }}
                          title="刷新题目"
                        >
                          🔄 换题
                        </button>
                      </div>
                      <input
                        type="text"
                        name="company_name_hp"
                        value={honeypot}
                        onChange={e => setHoneypot(e.target.value)}
                        style={{ display: 'none' }}
                        tabIndex={-1}
                        autoComplete="off"
                      />
                    </div>

                    <div className="form-group">
                      <label>
                        邮箱验证码 <span className="required-tag">*6位数字</span>
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="请输入收到的 6 位邮箱验证码"
                        value={authEmailCode}
                        onChange={e => { setAuthEmailCode(e.target.value); setAuthError(null); }}
                        required
                      />
                    </div>

                    {/* 收信与垃圾箱提示（可点击 我知道了 关闭） */}
                    {showSpamHint ? (
                      <div
                        style={{
                          margin: '12px 0 16px 0',
                          padding: '12px 14px',
                          background: 'linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)',
                          border: '1px solid #bfdbfe',
                          borderRadius: '10px',
                          fontSize: '13px',
                          color: '#1e3a8a',
                          boxShadow: '0 4px 12px rgba(59, 130, 246, 0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '8px'
                        }}
                      >
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>📬</span>
                          <div style={{ lineHeight: '1.6', flex: 1 }}>
                            <div style={{ fontWeight: '700', color: '#1d4ed8', marginBottom: '2px' }}>
                              验证码已发送至 {authInputEmail}
                            </div>
                            <div style={{ fontSize: '12px', color: '#475569' }}>
                              发信人：<code>verify@fangwengudao.us.kg</code>
                            </div>
                            <div style={{ marginTop: '4px', color: '#0369a1', fontSize: '12px' }}>
                              💡 <strong>重要提醒：</strong>若收件箱未看到，请检查<strong>「垃圾邮件 / 垃圾箱」</strong>并点击「这不是垃圾邮件」。
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '2px' }}>
                          <button
                            type="button"
                            onClick={() => setShowSpamHint(false)}
                            style={{
                              background: '#2563eb',
                              color: '#ffffff',
                              border: 'none',
                              borderRadius: '6px',
                              padding: '5px 14px',
                              fontSize: '12px',
                              fontWeight: '600',
                              cursor: 'pointer',
                              boxShadow: '0 2px 6px rgba(37, 99, 235, 0.25)',
                              transition: 'all 0.15s ease'
                            }}
                          >
                            ✓ 我知道了
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          margin: '8px 0 12px 0',
                          padding: '8px 12px',
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: '#64748b',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center'
                        }}
                      >
                        <span>💡 发信邮箱：<code>verify@fangwengudao.us.kg</code></span>
                        <button
                          type="button"
                          onClick={() => setShowSpamHint(true)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#2563eb',
                            fontSize: '12px',
                            cursor: 'pointer',
                            textDecoration: 'underline'
                          }}
                        >
                          收信帮助
                        </button>
                      </div>
                    )}
                  </>
                )}

                <div className="form-group">
                  <label>
                    {authMode === 'login' ? '登录密码' : '设置登录密码'} <span className="required-tag">*必填{authMode === 'register' ? ' (至少6位)' : ''}</span>
                  </label>
                  <input
                    type="password"
                    placeholder={authMode === 'login' ? '请输入登录密码' : '请设置至少6位登录密码'}
                    value={authInputPassword}
                    onChange={e => { setAuthInputPassword(e.target.value); setAuthError(null); }}
                    minLength={authMode === 'register' ? 6 : undefined}
                    required
                  />
                </div>

                {/* 仅在登录页展示 1 个免登录体验账号 */}
                {authMode === 'login' && (
                  <div className="quick-demo-section" style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px dashed #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '12px', color: '#64748b' }}>💡 免登录离线体验：</span>
                    <button
                      type="button"
                      className="demo-chip"
                      onClick={async () => {
                        await login('乐谱创作者');
                        setShowAuthModal(false);
                        showToast('已切换至「乐谱创作者」体验账号', 'success');
                      }}
                      style={{ margin: 0, padding: '4px 12px', fontSize: '12px', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#2563eb', borderRadius: '6px', cursor: 'pointer' }}
                    >
                      🎵 游客体验账号
                    </button>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button type="button" className="btn-cancel" onClick={() => setShowAuthModal(false)} disabled={authLoading}>
                  取消
                </button>
                <button type="submit" className="btn-confirm" disabled={authLoading}>
                  {authLoading
                    ? (authMode === 'login' ? '登录中...' : '注册中...')
                    : (authMode === 'login' ? '立即登录' : '立即注册')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
