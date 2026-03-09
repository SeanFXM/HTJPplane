# Live 实时协作服务配置指南

Live 服务提供页面编辑器的实时协作（WebSocket），需要单独部署并与 Redis 配合使用。

---

## 一、本地开发配置

### 1. 安装 Redis

```bash
# macOS (Homebrew)
brew install redis
brew services start redis

# 或使用 Docker
docker run -d -p 6379:6379 redis:alpine
```

### 2. 创建 Live 服务环境变量

```bash
cd apps/live
cp .env.example .env
# 根据需要编辑 .env
```

### 3. 启动服务

```bash
# 在项目根目录
pnpm dev
# 或单独启动 Live
pnpm --filter=live dev
```

Live 默认运行在 `http://localhost:3100`，WebSocket 路径为 `/live/collaboration`。

### 4. 确保 Web 前端已配置

`apps/web/.env` 中需包含：

```env
VITE_LIVE_BASE_URL="http://localhost:3100"
VITE_LIVE_BASE_PATH="/live"
```

---

## 二、Railway 生产环境部署

### 1. 部署 Live 服务

在 Railway 项目中新建一个服务：

**使用 Dockerfile**

- **根目录**：留空或设为项目根目录（Railway 会克隆完整仓库）
- **Dockerfile 路径**：在服务 Variables 中设置 `RAILWAY_DOCKERFILE_PATH=apps/live/Dockerfile.live`
- 或在 Railway 服务设置 → Build → Dockerfile Path 中填写 `apps/live/Dockerfile.live`
- Railway 会自动注入 `PORT`，无需在 Dockerfile 中指定

### 2. 添加 Redis

在 Railway 中为 Live 服务添加 Redis 插件，或使用外部 Redis 服务（如 Upstash）。

### 3. Live 服务环境变量

在 Railway → Live 服务 → Variables 中添加：

| 变量名                   | 说明                                           | 示例                                                                     |
| ------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------ |
| `PORT`                   | 服务端口（Railway 自动注入）                   | `3000`                                                                   |
| `API_BASE_URL`           | 主 API 地址                                    | `https://htjpplane-api-production.up.railway.app`                        |
| `CORS_ALLOWED_ORIGINS`   | 允许连接的前端地址，多个用逗号分隔             | `https://task.hotone.jp,https://htjpplane-web-production.up.railway.app` |
| `LIVE_BASE_PATH`         | WebSocket 路径前缀                             | `/live`                                                                  |
| `LIVE_SERVER_SECRET_KEY` | 服务密钥（生产环境用强随机字符串）             | 随机生成                                                                 |
| `REDIS_URL`              | Redis 连接地址（Railway Redis 插件会自动提供） | `redis://default:xxx@xxx.railway.internal:6379`                          |

**重要**：`CORS_ALLOWED_ORIGINS` 必须包含你的前端域名（如 `https://task.hotone.jp`），否则 WebSocket 连接会被拒绝。

### 4. Web 前端环境变量

在 Railway → Web 服务 → Variables 中确保有：

| 变量名                | 说明              | 示例                                               |
| --------------------- | ----------------- | -------------------------------------------------- |
| `VITE_LIVE_BASE_URL`  | Live 服务公网地址 | `https://htjpplane-live-production.up.railway.app` |
| `VITE_LIVE_BASE_PATH` | 路径前缀          | `/live`                                            |

**注意**：`VITE_*` 变量在构建时注入，修改后需重新部署 Web 服务。

---

## 三、配置检查清单

- [ ] Redis 已启动且 Live 能连接
- [ ] Live 的 `API_BASE_URL` 指向正确的 API 服务
- [ ] Live 的 `CORS_ALLOWED_ORIGINS` 包含前端域名
- [ ] Web 的 `VITE_LIVE_BASE_URL` 指向 Live 服务公网地址
- [ ] 生产环境使用 `https://`，不要用 `http://`

---

## 四、验证连接

1. 打开浏览器控制台
2. 进入任意页面编辑器
3. 若配置正确，不应再出现 `WebSocket connection to '...' failed` 错误
4. 页面右上角同步状态应显示为「已同步」
