-- Easypu D1 Database Schema
-- 适用于 Cloudflare D1 (SQLite)

-- 1. 用户表 (账号唯一索引与密码哈希)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  canonical_email TEXT,
  password_hash TEXT NOT NULL,
  avatar TEXT DEFAULT '🎼',
  invite_code TEXT NOT NULL,
  is_cloud_user INTEGER DEFAULT 1,
  created_at TEXT NOT NULL
);

-- 2. 文件夹表
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 乐谱元数据表
CREATE TABLE IF NOT EXISTS scores (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT,
  author TEXT,
  folder_id TEXT,
  key_signature TEXT DEFAULT '1=C',
  time_signature TEXT DEFAULT '4/4',
  measures_count INTEGER DEFAULT 0,
  is_favorite INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. 注册风控审计日志表 (IP 速率限制)
CREATE TABLE IF NOT EXISTS registration_logs (
  id TEXT PRIMARY KEY,
  ip TEXT NOT NULL,
  normalized_email TEXT NOT NULL,
  created_at TEXT NOT NULL
);

-- 5. 邮箱验证码表 (Resend 邮件验证)
CREATE TABLE IF NOT EXISTS email_verifications (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);

-- 创建索引以加速查询与风控
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_canonical ON users(canonical_email);
CREATE INDEX IF NOT EXISTS idx_reg_ip_time ON registration_logs(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_scores_user_id ON scores(user_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
