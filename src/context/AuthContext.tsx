import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { User, StorageStats } from '../types/storage';
import { storageService, DEFAULT_USER } from '../services/StorageService';
import {
  getCloudStatus,
  pushToCloud,
  pullFromCloud,
  type CloudStatus,
} from '../services/CloudSyncService';

export interface CaptchaData {
  question: string;
  token: string;
  timestamp: number;
}

interface AuthContextType {
  currentUser: User;
  isAuthenticated: boolean;
  login: (usernameOrEmail: string, password?: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    emailCode: string,
    password: string,
    captchaAnswer: string,
    captchaToken: string,
    captchaTimestamp: number,
    avatar?: string
  ) => Promise<void>;
  sendEmailCode: (
    email: string,
    captchaAnswer: string,
    captchaToken: string,
    captchaTimestamp: number
  ) => Promise<{ message: string; devHint?: string }>;
  getCaptcha: () => Promise<CaptchaData>;
  logout: () => void;
  stats: StorageStats;
  refreshStats: () => void;
  showAuthModal: boolean;
  setShowAuthModal: (show: boolean) => void;
  // Cloud sync
  cloudStatus: CloudStatus & { syncing: boolean; lastError: string | null };
  syncPush: () => Promise<void>;
  syncPull: () => Promise<{ scoresCount: number } | null>;
  checkCloudStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Cloud Auth API helpers ────────────────────────────────────────────────

/**
 * 获取人机验证验证码题目
 */
async function apiGetCaptcha(): Promise<CaptchaData> {
  const res = await fetch('/api/auth/captcha');
  if (!res.ok) {
    throw new Error('获取人机验证码失败，请刷新重试');
  }
  return res.json();
}

/**
 * 发送邮箱验证码 (通过 Resend)
 */
async function apiSendEmailCode(
  email: string,
  captchaAnswer: string,
  captchaToken: string,
  captchaTimestamp: number
): Promise<{ message: string; devHint?: string }> {
  const res = await fetch('/api/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      captchaAnswer,
      captchaToken,
      captchaTimestamp
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '发送验证码失败，请稍后重试');
  }
  return data;
}

/**
 * 开放注册：带人机安全验证与邮箱验证码，并将用户信息写入 D1 / R2
 */
async function apiRegister(
  username: string,
  email: string,
  emailCode: string,
  password: string,
  captchaAnswer: string,
  captchaToken: string,
  captchaTimestamp: number,
  avatar: string,
  localId: string
): Promise<User> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username,
      email,
      emailCode,
      password,
      captchaAnswer,
      captchaToken,
      captchaTimestamp,
      avatar,
      id: localId
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '注册失败，请稍后重试');
  }
  if (!data.user) {
    throw new Error('注册返回格式不正确');
  }
  return data.user;
}

/**
 * 登录：从 R2 按用户名/邮箱查找用户并验证密码
 */
async function apiLogin(usernameOrEmail: string, password?: string): Promise<User> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || '登录失败，请检查用户名或密码');
  }
  if (!data.user) {
    throw new Error('登录返回格式不正确');
  }
  return data.user;
}

// ─── AuthProvider ──────────────────────────────────────────────────────────

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [currentUser, setCurrentUser] = useState<User>(() => storageService.getCurrentUser());
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [stats, setStats] = useState<StorageStats>(() => storageService.getStats(currentUser.id));
  const [cloudStatus, setCloudStatus] = useState<CloudStatus & { syncing: boolean; lastError: string | null }>({
    hasBackup: false,
    updatedAt: null,
    scoresCount: 0,
    syncing: false,
    lastError: null,
  });

  const refreshStats = useCallback(() => {
    setStats(storageService.getStats(currentUser.id));
  }, [currentUser.id]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  const checkCloudStatus = useCallback(async () => {
    if (currentUser.id === 'user_default' || !currentUser.isCloudUser) return;
    try {
      const status = await getCloudStatus(currentUser.id);
      setCloudStatus(prev => ({ ...prev, ...status, lastError: null }));
    } catch {
      // 静默失败，不影响本地使用
    }
  }, [currentUser.id, currentUser.isCloudUser]);

  // 登录后自动检查云状态
  useEffect(() => {
    if (currentUser.id !== 'user_default' && currentUser.isCloudUser) {
      checkCloudStatus();
    }
  }, [currentUser.id, currentUser.isCloudUser, checkCloudStatus]);

  const getCaptcha = useCallback(async () => {
    return apiGetCaptcha();
  }, []);

  const sendEmailCode = useCallback(async (
    email: string,
    captchaAnswer: string,
    captchaToken: string,
    captchaTimestamp: number
  ) => {
    return apiSendEmailCode(email, captchaAnswer, captchaToken, captchaTimestamp);
  }, []);

  /**
   * 登录流程：
   * 1. 判断是否为预设体验账号，若是则直接本地切换
   * 2. 调用 /api/auth/login 从 D1/R2 校验用户名与密码
   * 3. 校验成功 → 以服务端用户数据为准同步到本地 localStorage 并关闭弹窗
   */
  const login = useCallback(async (usernameOrEmail: string, password?: string) => {
    const cleanQuery = usernameOrEmail.trim();

    // 预设体验账号支持直接一键体验
    const isPresetDemo = ['乐谱创作者', '民乐创作者', '简谱排版员', '音乐教师'].some(
      name => name.toLowerCase() === cleanQuery.toLowerCase()
    );

    if (isPresetDemo) {
      const localDemoUser = storageService.loginUser(cleanQuery);
      setCurrentUser(localDemoUser);
      setShowAuthModal(false);
      return;
    }

    // 正式云端用户向后端 /api/auth/login 校验
    if (!password) {
      throw new Error('请输入登录密码');
    }

    const cloudUser = await apiLogin(cleanQuery, password);

    // 云端验证成功：标记为云用户并持久化到本地
    const fullUser: User = {
      ...cloudUser,
      isCloudUser: true,
    };

    storageService.setCurrentUser(fullUser);
    const users = storageService.getUsers();
    const idx = users.findIndex(u => u.id === fullUser.id);
    if (idx !== -1) users.splice(idx, 1, fullUser);
    else users.push(fullUser);
    localStorage.setItem('easypu_users', JSON.stringify(users));

    setCurrentUser(fullUser);
    setShowAuthModal(false);
  }, []);

  /**
   * 开放免费注册流程：
   * 1. 人机计算验证
   * 2. 校验邮箱验证码
   * 3. 校验用户名唯一性与密码 (>=6位)
   * 4. 在 D1 与 R2 创建用户
   * 5. 注册成功后默认直接登录并关闭弹窗
   */
  const register = useCallback(
    async (
      username: string,
      email: string,
      emailCode: string,
      password: string,
      captchaAnswer: string,
      captchaToken: string,
      captchaTimestamp: number,
      avatar?: string
    ) => {
      if (!emailCode || emailCode.trim().length !== 6) {
        throw new Error('请输入收到的 6 位邮箱验证码');
      }

      if (!password || password.length < 6) {
        throw new Error('密码长度至少需要6位');
      }

      if (!captchaAnswer || !captchaToken) {
        throw new Error('请完成人机安全验证');
      }

      // 先在本地准备生成唯一 ID
      const localUser = storageService.registerUser(username, email, 'free_public');

      // 调用后端注册接口（人机验证与全局唯一性校验）
      const cloudUser = await apiRegister(
        username,
        email,
        emailCode.trim(),
        password,
        captchaAnswer,
        captchaToken,
        captchaTimestamp,
        avatar || localUser.avatar || '🎼',
        localUser.id
      );

      const finalUser: User = {
        ...(cloudUser || localUser),
        inviteCode: 'free_public',
        isCloudUser: true,
      };

      storageService.setCurrentUser(finalUser);
      const users = storageService.getUsers();
      const idx = users.findIndex(u => u.id === finalUser.id);
      if (idx !== -1) users.splice(idx, 1, finalUser);
      else users.push(finalUser);
      localStorage.setItem('easypu_users', JSON.stringify(users));

      // 默认直接登录并关闭弹窗
      setCurrentUser(finalUser);
      setShowAuthModal(false);
    },
    []
  );

  const logout = () => {
    storageService.logoutUser();
    setCurrentUser(DEFAULT_USER);
    setCloudStatus({ hasBackup: false, updatedAt: null, scoresCount: 0, syncing: false, lastError: null });
  };

  const isAuthenticated = currentUser.id !== 'user_default';

  /**
   * 将本地所有数据推送到云端
   */
  const syncPush = useCallback(async () => {
    if (!isAuthenticated) return;
    setCloudStatus(prev => ({ ...prev, syncing: true, lastError: null }));
    try {
      const scores = storageService.getAllScores(currentUser.id);
      const folders = storageService.getFolders(currentUser.id);
      const result = await pushToCloud(currentUser.id, scores, folders);
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        hasBackup: true,
        updatedAt: result.updatedAt,
        scoresCount: result.scoresCount,
        lastError: null,
      }));
    } catch (err: any) {
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        lastError: err.message || '同步失败',
      }));
      throw err;
    }
  }, [currentUser.id, isAuthenticated]);

  /**
   * 从云端拉取数据并合并到本地
   */
  const syncPull = useCallback(async (): Promise<{ scoresCount: number } | null> => {
    if (!isAuthenticated) return null;
    setCloudStatus(prev => ({ ...prev, syncing: true, lastError: null }));
    try {
      const data = await pullFromCloud(currentUser.id);
      if (!data) {
        setCloudStatus(prev => ({ ...prev, syncing: false }));
        return null;
      }
      storageService.saveScores(data.scores, currentUser.id);
      storageService.saveFolders(data.folders, currentUser.id);
      refreshStats();
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        hasBackup: true,
        updatedAt: data.updatedAt,
        scoresCount: data.scoresCount,
        lastError: null,
      }));
      return { scoresCount: data.scoresCount };
    } catch (err: any) {
      setCloudStatus(prev => ({
        ...prev,
        syncing: false,
        lastError: err.message || '恢复失败',
      }));
      throw err;
    }
  }, [currentUser.id, isAuthenticated, refreshStats]);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated,
        login,
        register,
        sendEmailCode,
        getCaptcha,
        logout,
        stats,
        refreshStats,
        showAuthModal,
        setShowAuthModal,
        cloudStatus,
        syncPush,
        syncPull,
        checkCloudStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
