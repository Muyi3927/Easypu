# Easypu 简谱系统 Cloudflare 部署与 R2 存储桶配置指南

本项目已全面支持部署至 **Cloudflare Pages**，接入 **Cloudflare R2 存储桶** 实现用户曲谱文件云端持久化存储，并已绑定域名 **`pu.fangwengudao.us.kg`**。

---

## 核心架构设计

1. **本地离线缓存体验**：
   - 访客或未注册用户可直接使用默认体验账号（如「乐谱创作者」、「民乐创作者」、「简谱排版员」、「音乐教师」）。
   - 乐谱制作、编辑、排版、多小节管理、打印导出 PDF、本地文件夹管理等全部功能正常使用，数据持久化于浏览器本地缓存。

2. **Cloudflare D1 数据库 + R2 云空间（全员开放免费注册）**：
   - **D1 数据库**：负责用户信息、用户名/邮箱唯一性检查、密码哈希存储、文件夹与乐谱元数据检索。
   - **R2 对象存储**：负责乐谱完整数据 JSON 的大文件持久化与云备份。
   - **全自动实时同步**：注册用户无论在编辑器还是仪表盘保存、修改、移动、删除乐谱，系统均自动在后台无感持久化至云端。
   - **单用户 500 首免费配额**：单账号支持最多 500 首乐谱云端存储，同时配备动态数学人机验证防止机器人刷量。

---

## 快速部署步骤

### 步骤一：创建与初始化 D1 数据库

```bash
# 1. 登录 Cloudflare 账号
npx wrangler login

# 2. 创建 D1 数据库
npx wrangler d1 create easypu-db

# 3. 初始化表结构 (schema.sql)
npx wrangler d1 execute easypu-db --remote --file=./schema.sql
```

### 步骤二：创建 R2 存储桶

```bash
npx wrangler r2 bucket create easypu-scores
```

### 步骤三：绑定 D1 与 R2 并部署至 Pages

#### 方法一：通过 Cloudflare Pages 控制台绑定（推荐）
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/) -> **Workers & Pages** -> 点击您的项目 `easypu-app`。
2. 进入 **Settings** -> **Functions**：
   * **D1 database bindings** -> 点击 **Add binding**：
     * **Variable name**: `DB`
     * **D1 database**: 选择 `easypu-db`
   * **R2 bucket bindings** -> 点击 **Add binding**：
     * **Variable name**: `EASYPU_BUCKET`
     * **R2 bucket**: 选择 `easypu-scores`
3. 进入 **Custom domains** 绑定域名：`pu.fangwengudao.us.kg`。

#### 方法二：通过命令行一键部署
```bash
npm run build
npx wrangler pages deploy dist --project-name=easypu-app
```

---

## 接口路由说明

- `GET /api/status` : 服务健康检查与 D1/R2 绑定状态查询
- `GET /api/auth/captcha` : 获取动态人机验证计算题目与签名 Token
- `POST /api/auth/register` : 用户开放注册（人机验证、用户名/邮箱唯一性检查、密码加密存储）
- `POST /api/auth/login` : 用户登录（D1/R2 密码与账号校验）
- `GET /api/cloud/status` : 查询用户在云端的备份状态与乐谱数
- `POST /api/cloud/push` : 将用户全部本地曲谱与目录结构自动保存至云端（限制单用户 500 首）
- `POST /api/cloud/pull` : 用户换设备登录时自动拉取云端曲谱到本地浏览器
