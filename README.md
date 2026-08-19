# 🎵 Easypu 简谱制作与云端排版系统 (Easypu Jianpu Studio)

<div align="center">

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-square&logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![Vite](https://img.shields.io/badge/Vite-646CFF?style=flat-square&logo=vite&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Cloudflare_Pages-F38020?style=flat-square&logo=cloudflare&logoColor=white)
![D1](https://img.shields.io/badge/Cloudflare_D1-SQLite-0A85EA?style=flat-square)
![R2](https://img.shields.io/badge/Cloudflare_R2-S3_Storage-orange?style=flat-square)
[![GitHub Repo](https://img.shields.io/badge/GitHub-Muyi3927%2FEasypu-181717?style=flat-square&logo=github)](https://github.com/Muyi3927/Easypu)
![License](https://img.shields.io/badge/license-MIT-green?style=flat-square)

**新一代现代化、轻量高效的专业简谱在线排版与云端创作平台**  
支持实体键盘快速录入 · 3D 拟真琴键发音 · 智能动态 A4 分页 · 矢量 SVG 高清渲染 · 1:1 无损 PDF 导出 · Cloudflare 全栈无服务器云端存储

🔗 **在线演示体验**：[https://easypu.fangwengudao.us.kg](https://easypu.fangwengudao.us.kg)

</div>

---

## ✨ 核心特性

- 🎹 **极速键盘输入 & 3D 琴键发音**：
  - 支持数字键盘直接录入音符（`1~7`）、休止符（`0`）、延音线（`-`）、八分音符（`8`）、退格删除（`Backspace`）、升降八度（`↑ / ↓`），并配备 Web Audio 实时钢琴音频反馈。
- 🎼 **专业简谱排版与渲染引擎**：
  - 原生支持 **调号（1=C / 1=G 等）**、**拍号（2/4, 3/4, 4/4, 6/8 等）**、**速度标记（♩=70）**、**连音弧线 / 延音线（SVG 智能跨小节曲线）**、**多声部/多段歌词对齐**、**和弦与行首标注**。
- 📄 **A4 智能动态防溢出分页**：
  - 算法根据歌词行数、行间距与字体大小实时计算单行高度，精准切页；
  - 严格预留底部安全边距，页码绝对锚定最底端，杜绝内容重叠与遮挡。
- 🖨️ **1:1 纯净矢量 PDF 导出与打印**：
  - 精准匹配标准 A4（210mm × 297mm）尺寸，无任何多余空白夹页或模糊失真。
- ☁️ **离线优先 + Cloudflare Serverless 全栈云同步**：
  - **无需登录**：默认支持全功能本地离线创作与管理（基于浏览器本地存储）；
  - **云端空间**：支持免费注册专属云端账号（D1 关系数据库 + R2 对象存储），多设备自动实时同步。
- 📬 **Resend 邮件安全验证**：
  - 支持真人图形数学算术题安全验证 + Resend 专属发件域名验证码分发。

---

## ⌨️ 实体键盘快捷键速查表

在乐谱编辑界面中，无需鼠标来回点击，双手直接在键盘上即可完成整首曲谱的录入与编辑：

| 按键 | 功能 | 说明 |
| :--- | :--- | :--- |
| **`1` ~ `7`** | 音符录入 | 录入对应唱名（如 1=Do, 5=Sol），带即时真实大三角钢琴发音 |
| **`↑` / `↓`** | **高低八度** | **先按 `↑` 录入高音（连按两下倍高音）；先按 `↓` 录入低音（连按两下倍低音）；亦可选中后直接调节** |
| **`[` / `]`** | **升降音号** | **按 `[` 录入降音 `b`；按 `]` 录入升音 `#`（支持录入前预设或选中后直接切换）** |
| **`0`** | 休止符 | 录入休止符 `0` |
| **`-`** | 延音线 / 增时线 | 录入横向延音线 `—` |
| **`8`** | **1/8 ↔ 1/4 切换** | **按 8 在 1/8 音符（单条减时线）与 1/4 音符间智能切换** |
| **`9`** | **1/16 音符** | 切换为十六分音符（双减时线） |
| **`\`** 或 **`Alt+4`** | 四分音符 | 直接切回标准的 1/4 音符（时值 1.0） |
| **`⌫ Backspace`** | **退格删除** | **清除当前音符或自动回退清空刚刚输入的音符** |
| **`←` / `→`** | 移动光标 | 左右移动切换当前焦点音符 |
| **`.`** | 附点开关 | 为音符添加/取消附点时值（如 `5.`） |

---

## 🛠️ 技术架构

- **前端核心**：React 18 · TypeScript · Vite · Web Audio API · CSS 现代玻璃拟态设计 (Glassmorphism)
- **后端服务**：Cloudflare Pages Functions (Edge Serverless)
- **数据库**：Cloudflare D1 (Serverless SQLite)
- **对象存储**：Cloudflare R2 (S3 兼容的高速曲谱存储)
- **邮件服务**：Resend API (DKIM/SPF/DMARC 邮件投递)

---

## 🚀 本地开发与运行

### 1. 克隆项目与安装依赖
```bash
git clone https://github.com/Muyi3927/Easypu.git
cd Easypu
npm install
```

### 2. 配置本地环境变量
复制环境变量示例文件：
```bash
cp .dev.vars.example .dev.vars
```
编辑 `.dev.vars`，填入您的 Resend API Key（仅在测试本地邮件发送时需要）：
```ini
RESEND_API_KEY=re_your_api_key_here
RESEND_FROM_EMAIL=Easypu 简谱 <verify@your-domain.com>
```

### 3. 启动开发服务器
```bash
npm run dev
```
打开浏览器访问 `http://localhost:5173` 即可进入本地开发环境。

---

## 🌐 Cloudflare 全栈免费部署教程

本项目完美适配 **Cloudflare 免费版计划**（无需服务器，全球 CDN 极速加速）。

### 步骤一：创建 D1 数据库并初始化表结构
```bash
# 1. 登录 Cloudflare 账号
npx wrangler login

# 2. 创建 D1 数据库
npx wrangler d1 create easypu-db

# 3. 执行表结构初始化
npx wrangler d1 execute easypu-db --remote --file=./schema.sql
```

### 步骤二：创建 R2 对象存储桶
```bash
npx wrangler r2 bucket create easypu-scores
```

### 步骤三：在 Cloudflare Pages 面板绑定服务
1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) ➔ 进入 **Workers & Pages** ➔ 点击您的项目 `easypu-app`（或新建 Pages 项目）；
2. 进入 **Settings (设置)** ➔ **Functions (函数)**：
   - **D1 database bindings (D1 数据库绑定)** ➔ 点击 **Add binding**：
     - **Variable name (变量名)**：`DB`
     - **D1 database**：选择 `easypu-db`
   - **R2 bucket bindings (R2 存储桶绑定)** ➔ 点击 **Add binding**：
     - **Variable name (变量名)**：`EASYPU_BUCKET`
     - **R2 bucket**：选择 `easypu-scores`
3. 进入 **Settings (设置)** ➔ **Environment variables (环境变量)** ➔ 添加生产环境变量：
   - `RESEND_API_KEY`: 您的 Resend 秘钥（例如 `re_...`）
   - `RESEND_FROM_EMAIL`: 您的发件人邮箱（例如 `Easypu 简谱 <verify@your-domain.com>`）

### 步骤四：构建与部署
```bash
# 构建生产包
npm run build

# 一键部署至 Cloudflare Pages
npx wrangler pages deploy dist --project-name=easypu-app
```

### 步骤五：绑定自定义域名（可选）
在 Cloudflare Pages 的 **Custom domains** 中添加您的专属域名（例如 `pu.fangwengudao.us.kg`），系统会自动配置全球 HTTPS 证书。

---

## 📁 目录结构

```text
├── functions/               # Cloudflare Pages Functions 后端 Serverless 路由
│   └── api/
│       └── [[route]].ts     # 认证、人机验证、D1 数据库管理、R2 云同步 API
├── public/                  # 静态资源 (Favicon, 矢量图标)
├── src/
│   ├── assets/              # 图标与媒体资源
│   ├── components/          # 核心组件库
│   │   ├── Header.tsx       # 顶部导航、曲谱标题、云端同步状态、PDF 导出
│   │   ├── Toolbar.tsx      # 顶部悬浮工具栏 (音符时值、小节管理、歌词/标注)
│   │   ├── PianoKeyboard.tsx# 底部 100% 满宽 3D 拟真钢琴键盘 & 快捷辅助条
│   │   └── ScoreEditor.tsx  # A4 乐谱编辑画布、动态分页排版、小节与音符渲染
│   ├── context/             # 全局状态管理
│   │   ├── AuthContext.tsx  # 用户鉴权与云同步状态
│   │   ├── EditorContext.tsx# 当前编辑音符时值与附点状态
│   │   ├── ScoreContext.tsx # 乐谱核心数据流与历史记录回退 (Undo/Redo)
│   │   └── ToastContext.tsx # 顶部居中通知气泡
│   ├── pages/               # 页面级视图
│   │   ├── Dashboard.tsx    # 仪表盘乐谱管理中心、文件夹、回收站、登录注册弹窗
│   │   └── EditorPage.tsx   # 乐谱主编辑器页面
│   ├── services/            # 数据存储与云服务
│   │   ├── StorageService.ts# 浏览器本地 IndexedDB 离线持久化
│   │   └── CloudSyncService.ts # D1 + R2 双向云同步逻辑
│   └── utils/               # 音频合成 (Web Audio API)
├── schema.sql               # Cloudflare D1 数据库建表脚本
├── wrangler.toml            # Cloudflare Wrangler 配置文件
├── .dev.vars.example        # 环境变量模板
└── package.json
```

---

## 🔒 安全与隐私

- **无机密泄露**：所有敏感配置（API 密钥、私有环境变量）均通过 Cloudflare 运行时环境变量与本地 `.dev.vars` 隔离，已配置严格的 `.gitignore` 规则。
- **密码安全**：用户密码采用 SHA-256 带盐哈希计算，D1 数据库内不存储任何明文密码。
- **人机安全防护**：注册接口集成服务端动态生成的一次性数学验证码与 Honeypot 诱捕机制，有效防止恶意脚本刷号。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 协议开源。欢迎自由 Fork、二次开发或提交 PR！
