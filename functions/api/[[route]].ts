// Cloudflare Pages Function with R2 Bucket Integration
// Handles API requests for:
// - /api/status                         GET  - health check
// - /api/auth/register                  POST - register user (persist to R2)
// - /api/auth/login                     POST - login (lookup user from R2)
// - /api/scores (GET, POST)             CRUD for individual scores
// - /api/scores/:id (GET, PUT, DELETE)
// - /api/cloud/status                   GET  - query cloud backup info
// - /api/cloud/push                     POST - upload all local data to R2
// - /api/cloud/pull                     POST - download cloud data

interface Env {
  EASYPU_BUCKET?: R2Bucket;
  DB?: D1Database;
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
}

const SYNC_SALT = 'easypu_sync_salt_2024';
const PWD_SALT = 'easypu_user_password_salt_2024';
const RESERVED_DEMO_NAMES = ['乐谱创作者', '民乐创作者', '简谱排版员', '音乐教师'];

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  'tempmail.com', 'temp-mail.org', '10minutemail.com', '10minutemail.net', '10minutemail.org',
  'guerrillamail.com', 'guerrillamail.net', 'guerrillamail.org', 'guerrillamailblock.com',
  'mailinator.com', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'sharklasers.com',
  'dispostable.com', 'getairmail.com', 'mohmal.com', 'throwawaymail.com', 'crazymailing.com',
  'trashmail.com', 'trashmail.net', 'trashmail.me', 'tempinbox.com', 'dropmail.me',
  'fakemailgenerator.com', 'inboxkitten.com', 'nada.ltd', 'getnada.com', 'emailondeck.com',
  'mintemail.com', 'mytrashmail.com', 'mailnesia.com', 'tempm.com', 'burnermail.io',
  'mailpoof.com', 'generator.email', 'tmail.ws', 'mailcatch.com', 'maildrop.cc',
  'disposable.email', 'mytemp.email', 'tmpmail.org', 'tmpmail.net', 'byom.de',
  'dayrep.com', 'teleworm.us', 'armyspy.com', 'cuvox.de', 'rhyta.com', 'superrito.com',
  '0-mail.com', '0815.ru', '0clickemail.com', '10mail.org', '20minutemail.com',
  'fakeinbox.com', 'mohmal.im', 'mohmal.in', 'emailfake.com', 'generator.email',
  'throwawayemailaddress.com', 'tempemail.co', 'tempail.com', 'internxt.com',
  'inboxbear.com', 'tempmailo.com', 'smailpro.com', 'crazymail.com', 'guerrillamail.biz'
]);

/**
 * 规范化邮箱地址，去除 + 标签与 Gmail 点号别名漏洞
 */
function normalizeEmail(email: string): { normalized: string; domain: string } {
  const clean = email.trim().toLowerCase();
  const parts = clean.split('@');
  if (parts.length !== 2) {
    return { normalized: clean, domain: '' };
  }
  let user = parts[0];
  const domain = parts[1];

  // 去除 + 别名 (如 user+1@... -> user@...)
  if (user.includes('+')) {
    user = user.split('+')[0];
  }

  // 对 gmail / googlemail 去除所有点号 (如 u.s.e.r -> user)
  if (domain === 'gmail.com' || domain === 'googlemail.com') {
    user = user.replace(/\./g, '');
  }

  return { normalized: `${user}@${domain}`, domain };
}

/**
 * 确保 D1 数据库表结构存在（自动建表与表结构自愈迁移机制）
 */
async function ensureD1Tables(db: D1Database): Promise<void> {
  try {
    await db.prepare(`
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
      )
    `).run();

    try {
      await db.prepare('ALTER TABLE users ADD COLUMN canonical_email TEXT').run();
    } catch {
      // 列已存在
    }

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS folders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        parent_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
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
        updated_at TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS registration_logs (
        id TEXT PRIMARY KEY,
        ip TEXT NOT NULL,
        normalized_email TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    await db.prepare(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        email TEXT PRIMARY KEY,
        code_hash TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at TEXT NOT NULL
      )
    `).run();

    try {
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_users_canonical ON users(canonical_email)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS idx_reg_ip_time ON registration_logs(ip, created_at)').run();
    } catch {
      // 索引已存在
    }
  } catch (err) {
    console.error('ensureD1Tables initialization error:', err);
  }
}

/**
 * 密码加密哈希
 */
async function hashPassword(password: string): Promise<string> {
  const data = new TextEncoder().encode(password + PWD_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 邮箱验证码哈希
 */
async function hashEmailCode(email: string, code: string): Promise<string> {
  const data = new TextEncoder().encode(`${email.trim().toLowerCase()}_${code.trim()}_${PWD_SALT}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 验证 token (Workers 环境中用 Web Crypto API)
 */
async function verifyToken(userId: string, token: string): Promise<boolean> {
  if (!token || token.length < 8) return false;
  const data = new TextEncoder().encode(userId + SYNC_SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex.startsWith(token);
}

const CAPTCHA_SALT = 'easypu_captcha_security_salt_2026';
const MAX_SCORES_PER_USER = 500;

/**
 * 验证码签名哈希
 */
async function hashCaptcha(answer: string, timestamp: number): Promise<string> {
  const data = new TextEncoder().encode(`${answer.trim().toLowerCase()}_${timestamp}_${CAPTCHA_SALT}`);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers });
  }

  const bucket = env.EASYPU_BUCKET;
  const db = env.DB;

  try {
    // ─── Health check ──────────────────────────────────────────────
    if (path === '/api/status') {
      return new Response(
        JSON.stringify({
          status: 'ok',
          service: 'Easypu Cloudflare Storage',
          r2Bound: !!bucket,
          d1Bound: !!db,
          resendConfigured: !!env.RESEND_API_KEY,
          maxScoresPerUser: MAX_SCORES_PER_USER,
          domain: 'pu.fangwengudao.us.kg',
          timestamp: new Date().toISOString(),
        }),
        { headers }
      );
    }

    // ─── Auth: Dynamic Math Captcha (防机器人) ───────────────────────
    // GET /api/auth/captcha
    if (path === '/api/auth/captcha' && method === 'GET') {
      const num1 = Math.floor(Math.random() * 12) + 1;
      const num2 = Math.floor(Math.random() * 12) + 1;
      const isAdd = Math.random() > 0.3;
      const question = isAdd ? `${num1} + ${num2} = ?` : `${num1 + num2} - ${num2} = ?`;
      const answer = isAdd ? String(num1 + num2) : String(num1);
      const timestamp = Date.now();
      const token = await hashCaptcha(answer, timestamp);

      return new Response(
        JSON.stringify({ question, token, timestamp }),
        { headers }
      );
    }

    // ─── Auth: Send Email Verification Code via Resend ─────────────
    // POST /api/auth/send-code  { email, captchaAnswer, captchaToken, captchaTimestamp, honeypot? }
    if (path === '/api/auth/send-code' && method === 'POST') {
      const body = await request.json() as any;
      const { email, captchaAnswer, captchaToken, captchaTimestamp, honeypot } = body;

      // 1. 蜜罐检查
      if (honeypot && String(honeypot).trim().length > 0) {
        return new Response(JSON.stringify({ error: '请求异常，已被拦截' }), { status: 400, headers });
      }

      // 2. 检查人机安全验证计算（先做人机题才能发邮件，彻底杜绝邮件轰炸）
      if (!captchaAnswer || !captchaToken || !captchaTimestamp) {
        return new Response(JSON.stringify({ error: '请先完成人机安全验证计算题' }), { status: 400, headers });
      }
      const nowMs = Date.now();
      if (nowMs - Number(captchaTimestamp) > 10 * 60 * 1000) {
        return new Response(JSON.stringify({ error: '人机验证已超时，请刷新题目后重试' }), { status: 400, headers });
      }
      const expectedToken = await hashCaptcha(String(captchaAnswer), Number(captchaTimestamp));
      if (expectedToken !== captchaToken) {
        return new Response(JSON.stringify({ error: '人机验证计算错误，请输入正确结果' }), { status: 400, headers });
      }

      // 3. 邮箱格式校验
      if (!email || !email.trim() || !email.includes('@')) {
        return new Response(JSON.stringify({ error: '请输入有效的电子邮箱地址' }), { status: 400, headers });
      }

      const emailLower = email.toLowerCase().trim();
      const { normalized: normalizedEmail, domain: emailDomain } = normalizeEmail(emailLower);

      // 4. 拦截临时邮箱黑名单
      if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
        return new Response(
          JSON.stringify({ error: '为了账号安全，不支持使用临时一次性邮箱，请使用常用邮箱（如 QQ、163、Gmail 等）。' }),
          { status: 400, headers }
        );
      }

      // 5. 检查邮箱是否已被注册
      if (db) {
        await ensureD1Tables(db);
        const existing: any = await db
          .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?) OR canonical_email = ?')
          .bind(emailLower, normalizedEmail)
          .first();
        if (existing) {
          return new Response(JSON.stringify({ error: '该邮箱已被注册，请直接使用密码登录' }), { status: 400, headers });
        }
      }

      // 6. 发信频率冷却检查 (同一邮箱 60 秒内只能获取一次)
      if (db) {
        const existingCode: any = await db
          .prepare('SELECT created_at FROM email_verifications WHERE email = ?')
          .bind(emailLower)
          .first();
        if (existingCode && existingCode.created_at) {
          const lastSentTime = new Date(existingCode.created_at).getTime();
          const elapsed = (Date.now() - lastSentTime) / 1000;
          if (elapsed < 60) {
            return new Response(
              JSON.stringify({ error: `发送过于频繁，请等待 ${Math.ceil(60 - elapsed)} 秒后再重新获取。` }),
              { status: 429, headers }
            );
          }
        }
      }

      // 7. 生成 6 位随机验证码
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const codeHash = await hashEmailCode(emailLower, code);
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10分钟有效
      const nowIso = new Date().toISOString();

      // 8. 调用 Resend 发送邮件
      const resendApiKey = env.RESEND_API_KEY;
      let fromEmail = env.RESEND_FROM_EMAIL || 'Easypu 简谱 <verify@fangwengudao.us.kg>';

      const isLocalDev = !resendApiKey || url.hostname === 'localhost' || url.hostname === '127.0.0.1';

      console.log(`\n==========================================`);
      console.log(`🎵 [Easypu 注册验证码] 邮箱: ${emailLower} | 验证码: ${code}`);
      console.log(`==========================================\n`);

      if (resendApiKey) {
        try {
          const emailPayload = {
            from: fromEmail,
            to: [emailLower],
            reply_to: 'verify@fangwengudao.us.kg',
            subject: `Easypu 简谱系统验证码: ${code}`,
            text: `您好！感谢使用 Easypu 简谱制作平台。\n\n您的注册验证码为：${code}\n\n验证码有效期为 10 分钟。如非本人操作，请忽略此邮件。`,
            html: `
              <div style="max-width: 520px; margin: 0 auto; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
                <div style="background: linear-gradient(135deg, #3b82f6, #6366f1); padding: 24px; text-align: center; color: #ffffff;">
                  <h1 style="margin: 0; font-size: 22px; font-weight: 700;">🎵 Easypu 简谱制作系统</h1>
                  <p style="margin: 6px 0 0 0; opacity: 0.9; font-size: 14px;">账号注册与安全验证</p>
                </div>
                <div style="padding: 28px;">
                  <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px;">您好！感谢使用简谱制作平台。您正在进行账号验证，验证码为：</p>
                  <div style="text-align: center; margin: 24px 0; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 8px; padding: 18px;">
                    <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #3b82f6; font-family: monospace;">${code}</span>
                  </div>
                  <p style="color: #64748b; font-size: 13px; margin: 0 0 8px 0;">• 验证码有效期为 <strong>10 分钟</strong>，请尽快完成验证。</p>
                  <p style="color: #64748b; font-size: 13px; margin: 0;">• 如非本人操作，请忽略此邮件，您的账号信息安全不会受到影响。</p>
                </div>
                <div style="background: #f1f5f9; padding: 14px 28px; text-align: center; color: #94a3b8; font-size: 12px; border-top: 1px solid #e2e8f0;">
                  服务站点: pu.fangwengudao.us.kg · 本邮件由系统自动发送，请勿直接回复
                </div>
              </div>
            `,
          };

          let res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(emailPayload),
          });

          let resData: any = await res.json().catch(() => ({}));

          // 如果自定义域名尚在验证中导致失败，自动切换为官方测试发信通道 onboarding@resend.dev 重试
          if (!res.ok && (resData.name === 'validation_error' || JSON.stringify(resData).toLowerCase().includes('domain') || JSON.stringify(resData).toLowerCase().includes('verify'))) {
            console.log('[Resend] 自定义域名暂未生效，自动降级至官方测试通道 onboarding@resend.dev');
            res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${resendApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                ...emailPayload,
                from: 'Easypu <onboarding@resend.dev>',
              }),
            });
            resData = await res.json().catch(() => ({}));
          }

          if (!res.ok) {
            console.error('Resend API Error:', resData);
            // 若仍报错（例如使用 onboarding@resend.dev 只能发给注册者本人邮箱），在响应中带上提示
            if (resData.message?.includes('can only send testing emails to your own email address')) {
              return new Response(
                JSON.stringify({
                  error: `自定义域名正在审核中。测试阶段请使用您注册 Resend 时的同一个邮箱进行测试，或直接查看控制台验证码。`,
                  devHint: `[测试通道提示] 验证码为: ${code}`,
                }),
                { status: 400, headers }
              );
            }
            return new Response(
              JSON.stringify({ error: `邮件发送失败：${resData.message || 'Resend 服务异常'}` }),
              { status: 500, headers }
            );
          }
        } catch (err: any) {
          console.error('Resend fetch error:', err);
          return new Response(
            JSON.stringify({ error: `邮件服务连接异常：${err.message || '网络错误'}` }),
            { status: 500, headers }
          );
        }
      }

      // 9. 保存验证码哈希到 D1 / R2
      if (db) {
        await db
          .prepare('INSERT OR REPLACE INTO email_verifications (email, code_hash, expires_at, created_at) VALUES (?, ?, ?, ?)')
          .bind(emailLower, codeHash, expiresAt, nowIso)
          .run();
      } else if (bucket) {
        await bucket.put(
          `auth/email-codes/${encodeURIComponent(emailLower)}.json`,
          JSON.stringify({ codeHash, expiresAt, createdAt: nowIso }),
          { httpMetadata: { contentType: 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          message: '验证码已发送至您的邮箱，10分钟内有效，请注意查收（若未收到请检查垃圾箱）。',
          devHint: isLocalDev ? `[测试通道提示] 验证码为: ${code}` : undefined,
        }),
        { headers }
      );
    }

    // ─── Auth: Open Register with Anti-Abuse & Email Verification ───
    // POST /api/auth/register  { username, email, emailCode, password, captchaAnswer, captchaToken, captchaTimestamp, honeypot?, avatar? }
    if (path === '/api/auth/register' && method === 'POST') {
      const body = await request.json() as any;
      const {
        username,
        email,
        emailCode,
        password,
        captchaAnswer,
        captchaToken,
        captchaTimestamp,
        honeypot,
        avatar = '🎼',
        id: clientId
      } = body;

      // 1. 蜜罐陷阱检查
      if (honeypot && String(honeypot).trim().length > 0) {
        return new Response(JSON.stringify({ error: '检测到异常注册请求' }), { status: 400, headers });
      }

      // 2. 人机安全验证计算检查
      if (!captchaAnswer || !captchaToken || !captchaTimestamp) {
        return new Response(JSON.stringify({ error: '请完成人机安全验证计算' }), { status: 400, headers });
      }
      const nowMs = Date.now();
      if (nowMs - Number(captchaTimestamp) > 10 * 60 * 1000) {
        return new Response(JSON.stringify({ error: '人机验证已超时，请刷新题目后重试' }), { status: 400, headers });
      }
      const expectedToken = await hashCaptcha(String(captchaAnswer), Number(captchaTimestamp));
      if (expectedToken !== captchaToken) {
        return new Response(JSON.stringify({ error: '人机验证计算结果错误，请重新计算输入' }), { status: 400, headers });
      }

      // 3. 基础必填项校验
      if (!username || !username.trim()) {
        return new Response(JSON.stringify({ error: '用户名不能为空' }), { status: 400, headers });
      }
      const cleanUsername = username.trim();
      if (cleanUsername.length < 2) {
        return new Response(JSON.stringify({ error: '用户名长度至少需要2个字符' }), { status: 400, headers });
      }

      if (!email || !email.trim() || !email.includes('@')) {
        return new Response(JSON.stringify({ error: '请输入有效的电子邮箱' }), { status: 400, headers });
      }

      const emailLower = email.toLowerCase().trim();

      // 4. 邮箱验证码校验
      if (!emailCode || String(emailCode).trim().length !== 6) {
        return new Response(JSON.stringify({ error: '请输入收到的 6 位邮箱验证码' }), { status: 400, headers });
      }
      const expectedCodeHash = await hashEmailCode(emailLower, String(emailCode).trim());

      if (db) {
        await ensureD1Tables(db);
        const codeRow: any = await db
          .prepare('SELECT code_hash, expires_at FROM email_verifications WHERE email = ?')
          .bind(emailLower)
          .first();

        if (!codeRow || codeRow.code_hash !== expectedCodeHash) {
          return new Response(JSON.stringify({ error: '邮箱验证码错误，请检查输入或重新获取' }), { status: 400, headers });
        }
        if (Date.now() > Number(codeRow.expires_at)) {
          return new Response(JSON.stringify({ error: '邮箱验证码已过期，请重新获取验证码' }), { status: 400, headers });
        }
      } else if (bucket) {
        const codeObj = await bucket.get(`auth/email-codes/${encodeURIComponent(emailLower)}.json`);
        if (!codeObj) {
          return new Response(JSON.stringify({ error: '邮箱验证码错误或已过期，请重新获取' }), { status: 400, headers });
        }
        const codeData = await codeObj.json() as any;
        if (codeData.codeHash !== expectedCodeHash || Date.now() > Number(codeData.expiresAt)) {
          return new Response(JSON.stringify({ error: '邮箱验证码错误或已过期，请重新获取' }), { status: 400, headers });
        }
      }

      if (!password || password.length < 6) {
        return new Response(JSON.stringify({ error: '密码不能为空且长度至少需要6位' }), { status: 400, headers });
      }

      // 5. 检查是否与预设体验账号重名
      if (RESERVED_DEMO_NAMES.includes(cleanUsername)) {
        return new Response(JSON.stringify({ error: '该名称为系统预设体验账号，请使用其他用户名' }), { status: 400, headers });
      }

      // 6. 邮箱格式化与别名漏洞封堵（去除 + 别名与 Gmail 点号别名）
      const { normalized: normalizedEmail, domain: emailDomain } = normalizeEmail(email);

      // 7. 拦截临时一次性邮箱黑名单
      if (DISPOSABLE_EMAIL_DOMAINS.has(emailDomain)) {
        return new Response(
          JSON.stringify({ error: '为了保障云端存储资源与账号安全，不支持使用临时一次性邮箱注册，请使用常用邮箱（如 QQ、163、Gmail 等）。' }),
          { status: 400, headers }
        );
      }

      // 8. IP 级注册速率限制（防同一网络批量刷号）
      const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

      if (db) {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

        // 1 小时最多 2 次
        const hourRow: any = await db
          .prepare('SELECT count(*) as cnt FROM registration_logs WHERE ip = ? AND created_at > ?')
          .bind(clientIp, oneHourAgo)
          .first();
        if (hourRow && hourRow.cnt >= 2) {
          return new Response(
            JSON.stringify({ error: '当前网络 IP 注册过于频繁，为保障服务质量，同一网络 1 小时内最多允许注册 2 个账号，请稍后再试。' }),
            { status: 429, headers }
          );
        }

        // 24 小时最多 5 次
        const dayRow: any = await db
          .prepare('SELECT count(*) as cnt FROM registration_logs WHERE ip = ? AND created_at > ?')
          .bind(clientIp, oneDayAgo)
          .first();
        if (dayRow && dayRow.cnt >= 5) {
          return new Response(
            JSON.stringify({ error: '当前网络 IP 今日注册次数已达上限（24 小时最多 5 个账号），请明天再试。' }),
            { status: 429, headers }
          );
        }
      }

      const usernameLower = cleanUsername.toLowerCase();

      // 9. 检查 D1 数据库中用户名、邮箱及主邮箱唯一性
      if (db) {
        const existingRow: any = await db
          .prepare('SELECT username, email, canonical_email FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?) OR canonical_email = ?')
          .bind(usernameLower, emailLower, normalizedEmail)
          .first();

        if (existingRow) {
          if (existingRow.username?.toLowerCase() === usernameLower) {
            return new Response(JSON.stringify({ error: '该用户名已被注册，请更换其他用户名' }), { status: 400, headers });
          }
          if (existingRow.email?.toLowerCase() === emailLower || existingRow.canonical_email === normalizedEmail) {
            return new Response(JSON.stringify({ error: '该电子邮箱（或主邮箱别名）已被注册，请直接登录' }), { status: 400, headers });
          }
        }
      } else if (bucket) {
        // 降级：检查 R2 中用户名和邮箱索引
        const nameKey = `auth/by-username/${encodeURIComponent(usernameLower)}.json`;
        const existingName = await bucket.get(nameKey);
        if (existingName) {
          return new Response(JSON.stringify({ error: '该用户名已被注册，请更换其他用户名' }), { status: 400, headers });
        }

        const emailKey = `auth/by-email/${encodeURIComponent(emailLower)}.json`;
        const existingEmail = await bucket.get(emailKey);
        if (existingEmail) {
          return new Response(JSON.stringify({ error: '该电子邮箱已被注册，请直接登录' }), { status: 400, headers });
        }

        const normKey = `auth/by-canonical/${encodeURIComponent(normalizedEmail)}.json`;
        const existingNorm = await bucket.get(normKey);
        if (existingNorm) {
          return new Response(JSON.stringify({ error: '该电子邮箱别名已被注册，请直接登录' }), { status: 400, headers });
        }
      }

      const userId = clientId || `user_${Array.from(crypto.getRandomValues(new Uint8Array(4))).map(b => b.toString(16).padStart(2, '0')).join('')}`;
      const now = new Date().toISOString();
      const passwordHash = await hashPassword(password);
      const openInviteCode = 'free_public';

      // 10. 写入 D1 数据库、销毁已用验证码并记录 IP 审计日志
      if (db) {
        await db
          .prepare(
            'INSERT INTO users (id, username, email, canonical_email, password_hash, avatar, invite_code, is_cloud_user, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)'
          )
          .bind(userId, cleanUsername, emailLower, normalizedEmail, passwordHash, avatar, openInviteCode, now)
          .run();

        await db.prepare('DELETE FROM email_verifications WHERE email = ?').bind(emailLower).run();

        const logId = `reg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await db
          .prepare('INSERT INTO registration_logs (id, ip, normalized_email, created_at) VALUES (?, ?, ?, ?)')
          .bind(logId, clientIp, normalizedEmail, now)
          .run();
      }

      // 11. 同时持久化到 R2 对象存储桶（双重备份）
      if (bucket) {
        const user = {
          id: userId,
          username: cleanUsername,
          email: emailLower,
          canonicalEmail: normalizedEmail,
          passwordHash,
          avatar,
          inviteCode: openInviteCode,
          isCloudUser: true,
          createdAt: now,
        };
        const userJson = JSON.stringify(user);
        await bucket.put(`auth/users/${userId}.json`, userJson, {
          httpMetadata: { contentType: 'application/json' },
          customMetadata: { username: cleanUsername, email: emailLower, createdAt: now, inviteCode: openInviteCode },
        });
        await bucket.put(`auth/by-email/${encodeURIComponent(emailLower)}.json`, userJson, {
          httpMetadata: { contentType: 'application/json' },
        });
        await bucket.put(`auth/by-canonical/${encodeURIComponent(normalizedEmail)}.json`, userJson, {
          httpMetadata: { contentType: 'application/json' },
        });
        await bucket.put(`auth/by-username/${encodeURIComponent(usernameLower)}.json`, userJson, {
          httpMetadata: { contentType: 'application/json' },
        });
        await bucket.delete(`auth/email-codes/${encodeURIComponent(emailLower)}.json`);
      }

      // 返回安全的用户对象（不包含 passwordHash）
      const safeUser = {
        id: userId,
        username: cleanUsername,
        email: emailLower,
        avatar,
        inviteCode: openInviteCode,
        isCloudUser: true,
        createdAt: now,
      };

      return new Response(JSON.stringify({ success: true, user: safeUser, existed: false }), { headers });
    }

    // ─── Auth: Login ───────────────────────────────────────────────
    // POST /api/auth/login  { usernameOrEmail, password }
    // 优先从 D1 查询校验，并可从 R2 查找
    if (path === '/api/auth/login' && method === 'POST') {
      const body = await request.json() as any;
      const { usernameOrEmail, password } = body;

      if (!usernameOrEmail || !usernameOrEmail.trim()) {
        return new Response(JSON.stringify({ error: '请输入用户名或电子邮箱' }), { status: 400, headers });
      }

      if (!password) {
        return new Response(JSON.stringify({ error: '请输入登录密码' }), { status: 400, headers });
      }

      const query = usernameOrEmail.trim().toLowerCase();
      let userObj: any = null;

      // 1. 优先从 D1 数据库查询
      if (db) {
        await ensureD1Tables(db);
        const userRow: any = await db
          .prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)')
          .bind(query, query)
          .first();

        if (userRow) {
          userObj = {
            id: userRow.id,
            username: userRow.username,
            email: userRow.email,
            passwordHash: userRow.password_hash,
            avatar: userRow.avatar || '🎼',
            inviteCode: userRow.invite_code,
            isCloudUser: true,
            createdAt: userRow.created_at,
          };
        }
      }

      // 2. 尝试从 R2 存储桶查询（D1 未命中或未绑定时）
      if (!userObj && bucket) {
        const emailObj = await bucket.get(`auth/by-email/${encodeURIComponent(query)}.json`);
        if (emailObj) {
          userObj = await emailObj.json();
        }
        if (!userObj) {
          const nameObj = await bucket.get(`auth/by-username/${encodeURIComponent(query)}.json`);
          if (nameObj) {
            userObj = await nameObj.json();
          }
        }
      }

      if (!userObj) {
        return new Response(
          JSON.stringify({ error: '账号不存在！未注册用户请先免费注册，或在下方点击体验账号直接体验。' }),
          { status: 404, headers }
        );
      }

      // 3. 校验密码哈希
      if (userObj.passwordHash) {
        const inputHash = await hashPassword(password);
        if (inputHash !== userObj.passwordHash) {
          return new Response(JSON.stringify({ error: '登录密码错误，请重新输入' }), { status: 401, headers });
        }
      }

      // 返回安全的用户数据
      const safeUser = {
        id: userObj.id,
        username: userObj.username,
        email: userObj.email,
        avatar: userObj.avatar || '🎼',
        inviteCode: userObj.inviteCode,
        isCloudUser: true,
        createdAt: userObj.createdAt,
      };

      return new Response(JSON.stringify({ success: true, user: safeUser }), { headers });
    }

    // ─── Cloud Sync: Status ────────────────────────────────────────
    if (path === '/api/cloud/status' && method === 'GET') {
      const userId = url.searchParams.get('userId') || '';
      const token = url.searchParams.get('token') || '';

      if (!userId || !(await verifyToken(userId, token))) {
        return new Response(JSON.stringify({ error: '无效的用户凭证' }), { status: 401, headers });
      }

      if (!bucket) {
        return new Response(JSON.stringify({ hasBackup: false, updatedAt: null, scoresCount: 0 }), { headers });
      }

      const key = `userdata/${userId}/backup.json`;
      const obj = await bucket.head(key);
      if (!obj) {
        return new Response(JSON.stringify({ hasBackup: false, updatedAt: null, scoresCount: 0 }), { headers });
      }

      const meta = obj.customMetadata || {};
      return new Response(
        JSON.stringify({
          hasBackup: true,
          updatedAt: meta.updatedAt || null,
          scoresCount: parseInt(meta.scoresCount || '0') || 0,
        }),
        { headers }
      );
    }

    // ─── Cloud Sync: Push (upload to R2, 单用户限制 500 首) ─────────
    if (path === '/api/cloud/push' && method === 'POST') {
      const body = await request.json() as any;
      const { userId, token, scores = [], folders = [] } = body;

      if (!userId || !(await verifyToken(userId, token))) {
        return new Response(JSON.stringify({ error: '无效的用户凭证' }), { status: 401, headers });
      }

      // 单用户配额限制（最多 500 首）
      if (scores && scores.length > MAX_SCORES_PER_USER) {
        return new Response(
          JSON.stringify({
            error: `超出单用户存储配额！每个账号最多可存储 ${MAX_SCORES_PER_USER} 首乐谱（当前提交 ${scores.length} 首），请清理乐谱后再同步。`,
          }),
          { status: 400, headers }
        );
      }

      const updatedAt = new Date().toISOString();
      const payload = { scores, folders, updatedAt, scoresCount: scores.length };

      if (bucket) {
        await bucket.put(
          `userdata/${userId}/backup.json`,
          JSON.stringify(payload),
          {
            httpMetadata: { contentType: 'application/json' },
            customMetadata: {
              updatedAt,
              scoresCount: String(scores.length),
              foldersCount: String(folders.length),
            },
          }
        );
      }

      // 如果有 D1 数据库，同步更新 scores 和 folders 表
      if (db) {
        try {
          await ensureD1Tables(db);
          // 清理旧记录并批量同步
          await db.prepare('DELETE FROM scores WHERE user_id = ?').bind(userId).run();
          await db.prepare('DELETE FROM folders WHERE user_id = ?').bind(userId).run();

          for (const f of folders) {
            await db.prepare(
              'INSERT INTO folders (id, user_id, name, parent_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
            ).bind(f.id, userId, f.name, f.parentId || null, f.createdAt || updatedAt, f.updatedAt || updatedAt).run();
          }

          for (const s of scores) {
            await db.prepare(
              'INSERT INTO scores (id, user_id, title, subtitle, author, folder_id, key_signature, time_signature, measures_count, is_favorite, is_deleted, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
            ).bind(
              s.id,
              userId,
              s.title || '无标题乐谱',
              s.subtitle || null,
              s.author || null,
              s.folderId || null,
              s.keySignature || '1=C',
              s.timeSignature || '4/4',
              s.measuresCount || 0,
              s.isFavorite ? 1 : 0,
              s.isDeleted ? 1 : 0,
              s.createdAt || updatedAt,
              s.updatedAt || updatedAt
            ).run();
          }
        } catch {
          // D1 写入异常不阻塞 R2 主备份
        }
      }

      return new Response(
        JSON.stringify({ success: true, updatedAt, scoresCount: scores.length }),
        { headers }
      );
    }

    // ─── Cloud Sync: Pull (download from R2) ──────────────────────
    if (path === '/api/cloud/pull' && method === 'POST') {
      const body = await request.json() as any;
      const { userId, token } = body;

      if (!userId || !(await verifyToken(userId, token))) {
        return new Response(JSON.stringify({ error: '无效的用户凭证' }), { status: 401, headers });
      }

      if (!bucket) {
        return new Response(JSON.stringify({ error: 'R2 未绑定' }), { status: 503, headers });
      }

      const key = `userdata/${userId}/backup.json`;
      const obj = await bucket.get(key);
      if (!obj) {
        return new Response(JSON.stringify({ error: '没有云备份' }), { status: 404, headers });
      }

      const data = await obj.json() as any;
      return new Response(JSON.stringify(data), { headers });
    }

    // ─── Score endpoints (existing) ────────────────────────────────
    if (path.startsWith('/api/scores')) {
      const scoreId = path.replace('/api/scores', '').replace('/', '');

      if (method === 'GET') {
        if (scoreId) {
          if (bucket) {
            const object = await bucket.get(`scores/${scoreId}.json`);
            if (!object) {
              return new Response(JSON.stringify({ error: 'Score not found' }), { status: 404, headers });
            }
            const data = await object.json();
            return new Response(JSON.stringify(data), { headers });
          }
          return new Response(JSON.stringify({ message: 'R2 fallback mode' }), { headers });
        } else {
          const userId = url.searchParams.get('userId') || 'default';
          if (bucket) {
            const listed = await bucket.list({ prefix: `scores/${userId}/` });
            const scores = await Promise.all(
              listed.objects.map(async (obj) => {
                const item = await bucket.get(obj.key);
                return item ? await item.json() : null;
              })
            );
            return new Response(JSON.stringify(scores.filter(Boolean)), { headers });
          }
          return new Response(JSON.stringify([]), { headers });
        }
      }

      if (method === 'POST' || method === 'PUT') {
        const body = await request.json() as any;
        const id = body.id || scoreId || `score_${Date.now()}`;
        const userId = body.userId || 'default';
        const key = `scores/${userId}/${id}.json`;

        if (bucket) {
          await bucket.put(key, JSON.stringify(body), {
            customMetadata: {
              title: body.title || '',
              updatedAt: new Date().toISOString(),
            },
          });
        }

        return new Response(JSON.stringify({ success: true, id, data: body }), { headers });
      }

      if (method === 'DELETE') {
        const userId = url.searchParams.get('userId') || 'default';
        if (bucket && scoreId) {
          await bucket.delete(`scores/${userId}/${scoreId}.json`);
        }
        return new Response(JSON.stringify({ success: true }), { headers });
      }
    }

    // Default fallback
    return new Response(JSON.stringify({ error: 'Not Found' }), { status: 404, headers });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers });
  }
};
