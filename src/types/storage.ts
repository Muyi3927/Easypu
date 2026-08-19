import type { Score } from './index';

export interface User {
  id: string;
  username: string;
  email: string;
  avatar?: string;
  createdAt: string;
  inviteCode?: string;
  isCloudUser?: boolean;
}

export interface FolderItem {
  id: string;
  name: string;
  parentId: string | null; // null for root folder
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ScoreMeta {
  id: string;
  title: string;
  subtitle?: string;
  author?: string;
  folderId: string | null; // null for root folder
  userId: string;
  createdAt: string;
  updatedAt: string;
  isFavorite?: boolean;
  isDeleted?: boolean; // soft deleted into Trash
  deletedAt?: string | null;
  scoreData?: Score; // full score object
  keySignature?: string;
  timeSignature?: string;
  measuresCount?: number;
}

export interface StorageStats {
  scoresCount: number;
  foldersCount: number;
  trashCount: number;
  storageUsedBytes: number;
}
