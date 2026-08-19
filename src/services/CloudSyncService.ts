/**
 * CloudSyncService.ts
 * 使用 Cloudflare Pages Functions + R2 实现云同步
 * 无需服务端账户系统：token = sha256(userId + salt) 前16位
 */

import type { ScoreMeta, FolderItem } from '../types/storage';

const SALT = 'easypu_sync_salt_2024';

/**
 * 生成访问 token（基于 Web Crypto API，浏览器和 Cloudflare Workers 均支持）
 */
export async function generateToken(userId: string): Promise<string> {
  const data = new TextEncoder().encode(userId + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 32); // 前32位作为 token
}

export interface CloudStatus {
  hasBackup: boolean;
  updatedAt: string | null;
  scoresCount: number;
}

export interface CloudPushResult {
  success: boolean;
  updatedAt: string;
  scoresCount: number;
}

export interface CloudPullResult {
  scores: ScoreMeta[];
  folders: FolderItem[];
  updatedAt: string;
  scoresCount: number;
}

/**
 * 查询云备份状态
 */
export async function getCloudStatus(userId: string): Promise<CloudStatus> {
  const token = await generateToken(userId);
  const res = await fetch(`/api/cloud/status?userId=${encodeURIComponent(userId)}&token=${token}`, {
    method: 'GET',
  });
  if (!res.ok) throw new Error(`查询云状态失败: ${res.status}`);
  return await res.json();
}

/**
 * 上传本地数据到云端 (push)
 */
export async function pushToCloud(
  userId: string,
  scores: ScoreMeta[],
  folders: FolderItem[]
): Promise<CloudPushResult> {
  const token = await generateToken(userId);
  const res = await fetch('/api/cloud/push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, token, scores, folders }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '未知错误' }));
    throw new Error(err.error || `上传失败: ${res.status}`);
  }
  return await res.json();
}

/**
 * 从云端拉取数据 (pull)
 */
export async function pullFromCloud(userId: string): Promise<CloudPullResult | null> {
  const token = await generateToken(userId);
  const res = await fetch('/api/cloud/pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, token }),
  });
  if (res.status === 404) return null; // 无云备份
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: '未知错误' }));
    throw new Error(err.error || `下载失败: ${res.status}`);
  }
  return await res.json();
}

/**
 * 格式化相对时间（上次同步）
 */
export function formatRelativeTime(isoString: string | null): string {
  if (!isoString) return '从未同步';
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return '刚刚同步';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前同步`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前同步`;
  const days = Math.floor(hours / 24);
  return `${days} 天前同步`;
}
