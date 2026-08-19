import { v4 as uuidv4 } from 'uuid';
import type { User, FolderItem, ScoreMeta, StorageStats } from '../types/storage';
import type { Score } from '../types';

const STORAGE_PREFIX = 'easypu_';
const USERS_KEY = `${STORAGE_PREFIX}users`;
const CURRENT_USER_KEY = `${STORAGE_PREFIX}current_user`;

// Default demo user for local offline experience
export const DEFAULT_USER: User = {
  id: 'user_default',
  username: '乐谱创作者',
  email: 'creator@easypu.local',
  avatar: '🎵',
  isCloudUser: false,
  createdAt: new Date().toISOString(),
};

// Preset demo accounts for quick local trial
export const PRESET_DEMO_USERS: User[] = [
  DEFAULT_USER,
  {
    id: 'user_demo_folk',
    username: '民乐创作者',
    email: 'minyue@easypu.local',
    avatar: '🎵',
    isCloudUser: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user_demo_editor',
    username: '简谱排版员',
    email: 'paiban@easypu.local',
    avatar: '🎹',
    isCloudUser: false,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'user_demo_teacher',
    username: '音乐教师',
    email: 'teacher@easypu.local',
    avatar: '🎤',
    isCloudUser: false,
    createdAt: new Date().toISOString(),
  },
];

export const MAX_SCORES_PER_USER = 500;

class StorageService {
  private getStorageKey(key: string, userId?: string): string {
    const uid = userId || this.getCurrentUser()?.id || 'guest';
    return `${STORAGE_PREFIX}${uid}_${key}`;
  }

  // --- Authentication & Users ---
  public getUsers(): User[] {
    try {
      const raw = localStorage.getItem(USERS_KEY);
      if (!raw) {
        localStorage.setItem(USERS_KEY, JSON.stringify(PRESET_DEMO_USERS));
        return PRESET_DEMO_USERS;
      }
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0 ? parsed : PRESET_DEMO_USERS;
    } catch {
      return PRESET_DEMO_USERS;
    }
  }

  public getCurrentUser(): User {
    try {
      const raw = localStorage.getItem(CURRENT_USER_KEY);
      if (raw) return JSON.parse(raw);
    } catch {
      // fallback
    }
    this.setCurrentUser(DEFAULT_USER);
    return DEFAULT_USER;
  }

  public setCurrentUser(user: User): void {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  }

  public loginUser(usernameOrEmail: string): User {
    const cleanQuery = usernameOrEmail.trim().toLowerCase();
    const users = this.getUsers();
    let user = users.find(
      u => u.username.toLowerCase() === cleanQuery ||
           u.email.toLowerCase() === cleanQuery
    );
    if (!user) {
      // Check preset demo users
      user = PRESET_DEMO_USERS.find(
        u => u.username.toLowerCase() === cleanQuery ||
             u.email.toLowerCase() === cleanQuery
      );
    }
    if (!user) {
      throw new Error('账号不存在！未注册用户请先免费注册或点击下方体验账号体验。');
    }
    this.setCurrentUser(user);
    return user;
  }

  public registerUser(username: string, email: string, inviteCode?: string): User {
    const cleanUsername = username.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (PRESET_DEMO_USERS.some(u => u.username.toLowerCase() === cleanUsername.toLowerCase())) {
      throw new Error('该名称为系统预设体验账号，请使用其他用户名');
    }

    const users = this.getUsers();
    const existing = users.find(
      u => u.username.toLowerCase() === cleanUsername.toLowerCase() ||
           u.email.toLowerCase() === cleanEmail
    );
    if (existing) {
      existing.isCloudUser = true;
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
      this.setCurrentUser(existing);
      return existing;
    }
    const newUser: User = {
      id: `user_${uuidv4().slice(0, 8)}`,
      username: cleanUsername,
      email: cleanEmail,
      avatar: '🎼',
      inviteCode: inviteCode || 'free_public',
      isCloudUser: true,
      createdAt: new Date().toISOString(),
    };
    users.push(newUser);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    this.setCurrentUser(newUser);
    return newUser;
  }

  public logoutUser(): void {
    this.setCurrentUser(DEFAULT_USER);
  }

  // --- Folders ---
  public getFolders(userId?: string): FolderItem[] {
    const key = this.getStorageKey('folders', userId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return [];
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveFolders(folders: FolderItem[], userId?: string): void {
    const key = this.getStorageKey('folders', userId);
    localStorage.setItem(key, JSON.stringify(folders));
  }

  public createFolder(name: string, parentId: string | null = null, userId?: string): FolderItem {
    const uid = userId || this.getCurrentUser().id;
    const folders = this.getFolders(uid);
    const newFolder: FolderItem = {
      id: `folder_${uuidv4().slice(0, 8)}`,
      name: name.trim() || '新建文件夹',
      parentId,
      userId: uid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    folders.push(newFolder);
    this.saveFolders(folders, uid);
    return newFolder;
  }

  public renameFolder(folderId: string, newName: string, userId?: string): void {
    const uid = userId || this.getCurrentUser().id;
    const folders = this.getFolders(uid);
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      folder.name = newName.trim() || folder.name;
      folder.updatedAt = new Date().toISOString();
      this.saveFolders(folders, uid);
    }
  }

  public moveFolder(folderId: string, targetParentId: string | null, userId?: string): void {
    if (folderId === targetParentId) return;
    const uid = userId || this.getCurrentUser().id;
    const folders = this.getFolders(uid);
    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      folder.parentId = targetParentId;
      folder.updatedAt = new Date().toISOString();
      this.saveFolders(folders, uid);
    }
  }

  public deleteFolder(folderId: string, userId?: string): void {
    const uid = userId || this.getCurrentUser().id;
    const folders = this.getFolders(uid);
    // Find all descendant folders recursively
    const idsToDelete = new Set<string>([folderId]);
    let added = true;
    while (added) {
      added = false;
      folders.forEach(f => {
        if (f.parentId && idsToDelete.has(f.parentId) && !idsToDelete.has(f.id)) {
          idsToDelete.add(f.id);
          added = true;
        }
      });
    }

    const remainingFolders = folders.filter(f => !idsToDelete.has(f.id));
    this.saveFolders(remainingFolders, uid);

    // Also move all scores in these deleted folders to root
    const scores = this.getAllScores(uid);
    scores.forEach(s => {
      if (s.folderId && idsToDelete.has(s.folderId)) {
        s.folderId = null;
      }
    });
    this.saveScores(scores, uid);
  }

  // --- Scores ---
  public getAllScores(userId?: string): ScoreMeta[] {
    const key = this.getStorageKey('scores', userId);
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return [];
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  public saveScores(scores: ScoreMeta[], userId?: string): void {
    const key = this.getStorageKey('scores', userId);
    localStorage.setItem(key, JSON.stringify(scores));
  }

  public getScoresByFolder(folderId: string | null, userId?: string): ScoreMeta[] {
    const uid = userId || this.getCurrentUser().id;
    const all = this.getAllScores(uid);
    return all.filter(s => !s.isDeleted && s.folderId === folderId);
  }

  public getTrashScores(userId?: string): ScoreMeta[] {
    const uid = userId || this.getCurrentUser().id;
    const all = this.getAllScores(uid);
    return all.filter(s => s.isDeleted);
  }

  public getFavoriteScores(userId?: string): ScoreMeta[] {
    const uid = userId || this.getCurrentUser().id;
    const all = this.getAllScores(uid);
    return all.filter(s => !s.isDeleted && s.isFavorite);
  }

  public getScoreById(scoreId: string, userId?: string): ScoreMeta | null {
    const uid = userId || this.getCurrentUser().id;
    const all = this.getAllScores(uid);
    return all.find(s => s.id === scoreId) || null;
  }

  public saveScore(scoreData: Partial<Score> | Score, scoreId?: string, folderId: string | null = null, userId?: string): ScoreMeta {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const existingIndex = scoreId ? scores.findIndex(s => s.id === scoreId) : -1;

    // 单用户乐谱数量限制检查（新建乐谱时）
    if (existingIndex === -1) {
      const activeCount = scores.filter(s => !s.isDeleted).length;
      if (activeCount >= MAX_SCORES_PER_USER) {
        throw new Error(`已达到单用户免费存储上限（最多 ${MAX_SCORES_PER_USER} 首乐谱），请清理回收站或删除不需要的乐谱后再新建。`);
      }
    }

    const measures = scoreData.measures && scoreData.measures.length > 0 
      ? scoreData.measures 
      : Array.from({ length: 12 }).map((_, i) => ({
          id: uuidv4(),
          notes: Array.from({ length: 4 }).map(() => ({
            id: uuidv4(),
            pitch: -2,
            octave: 0,
            duration: 1,
            isDotted: false,
            accidental: null
          })),
          isBreak: (i + 1) % 6 === 0
        }));

    const completeScore: Score = {
      title: scoreData.title || '无标题乐谱',
      subtitle: scoreData.subtitle || '',
      author: scoreData.author || '',
      keySignature: scoreData.keySignature || '1=C',
      timeSignature: scoreData.timeSignature || '4/4',
      tempo: scoreData.tempo || 70,
      showTempo: !!scoreData.showTempo,
      measuresPerLine: scoreData.measuresPerLine || 6,
      showStartBarline: !!scoreData.showStartBarline,
      baseFontSize: scoreData.baseFontSize || 20,
      lineHeight: scoreData.lineHeight !== undefined ? scoreData.lineHeight : 0.1,
      showMeasureNumber: !!scoreData.showMeasureNumber,
      measureNumberStyle: scoreData.measureNumberStyle || 'none',
      firstLineIndent: !!scoreData.firstLineIndent,
      titleFont: scoreData.titleFont || { fontFamily: '宋体', fontSize: 32, color: '#101010' },
      subtitleFont: scoreData.subtitleFont || { fontFamily: '宋体', fontSize: 16, color: '#101010' },
      noteFont: scoreData.noteFont || { fontFamily: 'Times New Roman', fontSize: 36, color: '#101010' },
      lyricFont: scoreData.lyricFont || { fontFamily: '黑体', fontSize: 36, color: '#101010' },
      chordFont: scoreData.chordFont || { fontFamily: '思源黑体', fontSize: 12, color: '#101010' },
      barlineSize: scoreData.barlineSize || 2,
      barlineColor: scoreData.barlineColor || '#3d3d3d',
      showPageNumber: scoreData.showPageNumber !== undefined ? scoreData.showPageNumber : true,
      pageNumberStyle: scoreData.pageNumberStyle || '1/2',
      pageNumberFont: scoreData.pageNumberFont || { fontFamily: '思源黑体', fontSize: 12, color: '#999999' },
      pageNumberPosition: scoreData.pageNumberPosition || 'center',
      pageWidth: scoreData.pageWidth || 980,
      pageMarginTop: scoreData.pageMarginTop !== undefined ? scoreData.pageMarginTop : 12,
      pageMarginBottom: scoreData.pageMarginBottom !== undefined ? scoreData.pageMarginBottom : 16,
      pageMarginLeft: scoreData.pageMarginLeft !== undefined ? scoreData.pageMarginLeft : 12,
      pageMarginRight: scoreData.pageMarginRight !== undefined ? scoreData.pageMarginRight : 12,
      ...scoreData,
      measures,
    };

    const now = new Date().toISOString();
    const meta: ScoreMeta = {
      id: scoreId || `score_${uuidv4().slice(0, 8)}`,
      title: completeScore.title || '无标题乐谱',
      subtitle: completeScore.subtitle || '',
      author: completeScore.author || '',
      folderId: existingIndex !== -1 ? scores[existingIndex].folderId : folderId,
      userId: uid,
      createdAt: existingIndex !== -1 ? scores[existingIndex].createdAt : now,
      updatedAt: now,
      isFavorite: existingIndex !== -1 ? !!scores[existingIndex].isFavorite : false,
      isDeleted: false,
      deletedAt: null,
      scoreData: completeScore,
      keySignature: completeScore.keySignature,
      timeSignature: completeScore.timeSignature,
      measuresCount: completeScore.measures?.length || 0,
    };

    if (existingIndex !== -1) {
      scores[existingIndex] = meta;
    } else {
      scores.unshift(meta);
    }

    this.saveScores(scores, uid);
    return meta;
  }

  public renameScore(scoreId: string, newTitle: string, userId?: string): void {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const score = scores.find(s => s.id === scoreId);
    if (score) {
      score.title = newTitle.trim() || score.title;
      if (score.scoreData) {
        score.scoreData.title = score.title;
      }
      score.updatedAt = new Date().toISOString();
      this.saveScores(scores, uid);
    }
  }

  public moveScore(scoreId: string, targetFolderId: string | null, userId?: string): void {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const score = scores.find(s => s.id === scoreId);
    if (score) {
      score.folderId = targetFolderId;
      score.updatedAt = new Date().toISOString();
      this.saveScores(scores, uid);
    }
  }

  public toggleFavorite(scoreId: string, userId?: string): boolean {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const score = scores.find(s => s.id === scoreId);
    if (score) {
      score.isFavorite = !score.isFavorite;
      this.saveScores(scores, uid);
      return score.isFavorite;
    }
    return false;
  }

  public moveToTrash(scoreId: string, userId?: string): void {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const score = scores.find(s => s.id === scoreId);
    if (score) {
      score.isDeleted = true;
      score.deletedAt = new Date().toISOString();
      this.saveScores(scores, uid);
    }
  }

  public restoreFromTrash(scoreId: string, userId?: string): void {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const score = scores.find(s => s.id === scoreId);
    if (score) {
      score.isDeleted = false;
      score.deletedAt = null;
      score.updatedAt = new Date().toISOString();
      this.saveScores(scores, uid);
    }
  }

  public permanentlyDeleteScore(scoreId: string, userId?: string): void {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const filtered = scores.filter(s => s.id !== scoreId);
    this.saveScores(filtered, uid);
  }

  public emptyTrash(userId?: string): void {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const active = scores.filter(s => !s.isDeleted);
    this.saveScores(active, uid);
  }

  public duplicateScore(scoreId: string, userId?: string): ScoreMeta | null {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const original = scores.find(s => s.id === scoreId);
    if (!original) return null;

    const newId = `score_${uuidv4().slice(0, 8)}`;
    const now = new Date().toISOString();
    const clonedData = original.scoreData ? JSON.parse(JSON.stringify(original.scoreData)) : undefined;
    if (clonedData) {
      clonedData.title = `${original.title} (副本)`;
    }

    const clonedMeta: ScoreMeta = {
      ...original,
      id: newId,
      title: `${original.title} (副本)`,
      createdAt: now,
      updatedAt: now,
      scoreData: clonedData,
      isFavorite: false,
      isDeleted: false,
      deletedAt: null,
    };

    scores.unshift(clonedMeta);
    this.saveScores(scores, uid);
    return clonedMeta;
  }

  public getStats(userId?: string): StorageStats {
    const uid = userId || this.getCurrentUser().id;
    const scores = this.getAllScores(uid);
    const folders = this.getFolders(uid);
    const activeScores = scores.filter(s => !s.isDeleted);
    const trashScores = scores.filter(s => s.isDeleted);

    const scoresJson = JSON.stringify(scores);
    const foldersJson = JSON.stringify(folders);
    const bytes = new Blob([scoresJson, foldersJson]).size;

    return {
      scoresCount: activeScores.length,
      foldersCount: folders.length,
      trashCount: trashScores.length,
      storageUsedBytes: bytes,
    };
  }
}

export const storageService = new StorageService();
