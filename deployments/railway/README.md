# 在 Railway 上低成本运行 Plane

这一套配置把 Plane 从「十几个常驻容器」收敛成 **1 个 Railway 应用容器 + Postgres + Redis**,
队列和对象存储用**免费的外部托管**,从而大幅压低 Railway 账单。

---

## 1. 为什么原来贵

Railway 按**每个容器**的内存/CPU 时长计费。Plane 默认是微服务全家桶,完整跑起来是 10+ 个常驻容器:

| 服务 | 类型 | 常驻内存(估) |
|------|------|------------|
| web | **静态 SPA**(`ssr:false`) | ~80–150MB |
| admin | **静态 SPA**(`ssr:false`) | ~80–150MB |
| space | SSR Node | ~150–250MB |
| live | Node 实时 | ~150–250MB |
| api | Django/gunicorn | ~400–600MB |
| worker | Celery | ~300–500MB |
| beat | Celery 定时 | ~150MB |
| rabbitmq | 队列 | ~200–400MB |
| redis | 缓存 | ~50–100MB |
| postgres | 数据库 | ~150–300MB |
| minio | 对象存储 | ~150MB |

合计 **2.5–3.5GB 常驻内存**,其中一大半是给「闲置占位」和「本可白嫖」的东西交钱。

四个浪费点:
1. **web / admin 是纯静态文件**,却用 24h Node 进程在伺候 —— 应该交给 CDN 或容器内的 Caddy。
2. **worker / beat / live / space 各自独占一个 Railway 服务** —— 它们完全可以和 api 挤进同一个容器。
3. **RabbitMQ 自托管** —— 吃内存,且有免费托管版可用。
4. **MinIO 自托管** —— 可换成 Cloudflare R2(免费、零出口流量费)。

---

## 2. 目标拓扑(本方案)

```
                         ┌─────────────────────────────────────────────┐
   用户 ── Railway 边缘 ──►│  单个容器 (Dockerfile.aio)                    │
        (TLS 终止)        │                                              │
                         │  Caddy :$PORT                                │
                         │   ├─ /            → /app/web   (静态)         │
                         │   ├─ /god-mode    → /app/admin (静态)         │
                         │   ├─ /spaces/*    → :3002 space (SSR)         │
                         │   ├─ /live/*      → :3005 live                │
                         │   └─ /api,/auth/* → :3004 api (gunicorn)      │
                         │  + celery worker + celery beat (supervisor)  │
                         └───────┬───────────────┬──────────────┬───────┘
                                 │               │              │
                        Railway Postgres   Railway Redis   外部免费服务:
                                                            · CloudAMQP (队列)
                                                            · Cloudflare R2 (存储)
```

Railway 上从 ~11 个服务降到 **3 个**(应用 + Postgres + Redis)。

---

## 3. 部署步骤

### 3.1 建库与外部服务(都在免费/便宜档)
- **Postgres / Redis**:在 Railway 项目里各加一个官方插件。
- **队列 → CloudAMQP**:注册 [cloudamqp.com](https://www.cloudamqp.com),建一个 **Little Lemur(免费)** 实例,复制它给的 `amqps://...` 作为 `AMQP_URL`。这样就不用在 Railway 跑 RabbitMQ。
- **存储 → Cloudflare R2**:建一个 R2 bucket + API Token,拿到 `AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY`,endpoint 是 `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`。R2 免费 10GB、**零出口费**。

### 3.2 配置 Railway 服务
1. 新建一个 service 指向本仓库。
2. Settings → Build:把 **Dockerfile Path** 设为 `deployments/railway/Dockerfile.aio`
   (或把 [`railway.json`](./railway.json) 放到仓库根目录走 config-as-code)。
3. Variables:按 [`plane.env.example`](./plane.env.example) 填齐。关键项:
   - `DATABASE_URL=${{Postgres.DATABASE_URL}}`、`REDIS_URL=${{Redis.REDIS_URL}}`
   - `AMQP_URL=`(CloudAMQP)
   - R2 那一组 + `USE_MINIO=0`
   - `SECRET_KEY` / `LIVE_SERVER_SECRET_KEY`(自己生成)
   - `DOMAIN_NAME` + `APP_PROTOCOL=https`
   - 成本旋钮:`GUNICORN_WORKERS=1`、`CELERY_WORKER_CONCURRENCY=2`
4. 不要手动设 `PORT` / `SITE_ADDRESS` —— Railway 注入 `PORT`,`start.sh` 会让 Caddy 监听它。
5. 健康检查路径填 `/`(Caddy 立刻能返回 web 静态页,不用等后端起来)。

### 3.3 先在本地验证镜像能 build(强烈建议)
这套 Dockerfile 是按本仓库现有的各 app Dockerfile 改写的,但**还没在 CI 里跑过**。
推上 Railway 前先本地构建一次,省得浪费构建分钟:

```bash
# 在仓库根目录
docker build -f deployments/railway/Dockerfile.aio -t plane-aio:local .

# 用外部 DB/Redis/MQ/R2 起一个本地实例验证
docker run --rm -p 8080:8080 -e PORT=8080 \
  -e DATABASE_URL=... -e REDIS_URL=... -e AMQP_URL=... \
  -e AWS_REGION=auto -e AWS_ACCESS_KEY_ID=... -e AWS_SECRET_ACCESS_KEY=... \
  -e AWS_S3_BUCKET_NAME=plane-uploads -e AWS_S3_ENDPOINT_URL=https://<acct>.r2.cloudflarestorage.com \
  -e USE_MINIO=0 -e SECRET_KEY=$(python -c "import secrets;print(secrets.token_hex(32))") \
  plane-aio:local
# 打开 http://localhost:8080
```

---

## 4. 还能更省:把 web / admin 甩到 Cloudflare Pages(可选)

web 和 admin 是纯静态包。AIO 容器里 Caddy 已经在免费托管它们了,但如果你想让**容器更小、访问更快、并蹭 CDN**,可以把它俩搬到 Cloudflare Pages / Netlify(免费):

```bash
# 构建(API 走同源 /api,所以 base url 留空即可)
pnpm install --frozen-lockfile
pnpm turbo run build --filter=web --filter=admin
# 上传产物目录:
#   apps/web/build/client    → Pages 项目 A(根路径)
#   apps/admin/build/client  → Pages 项目 B(路径 /god-mode)
```

要点:
- 两个都是 SPA,在 Pages 里加 **SPA fallback**(所有未命中路径重写到 `/index.html`)。
- 用 Cloudflare 规则把 `/api`、`/spaces`、`/live`、`/auth` 反代到 Railway 容器域名;其余走静态。
- 这样 Railway 容器可以设 `ENABLE_SPACE`/静态部分都不再需要,只留后端 + live。

> 如果嫌这一步麻烦,**跳过即可** —— AIO 容器内的 Caddy already 把静态托管的成本降到接近 0。
> 这一步纯属「锦上添花 + 全球加速」。

---

## 5. 成本对比(基于本项目 Railway Usage 实测,Jun 5–Jul 5)

这个项目("Hotone Japan Plane")当月用量 **$17.04**,几乎全是内存费,而且**单个 api 服务就占 $14.41(85%)** —— 它常驻吃掉 ~1.44GB RAM,根因是 `RUN_EMBEDDED_CELERY_WORKER=1` 且 Celery 并发没设上限(默认按 CPU 核数起进程,每个进程加载整个 Django)。

| 服务 | 实测月费 | 备注 |
|---|---|---|
| **HTJPplane-api** | **$14.41** | ~1.44GB,主要是 embedded celery 未限并发 |
| Bucket(MinIO) | $0.85 | → Cloudflare R2 免费 |
| HTJPplane-web | $0.79 | 静态,可进一步上 CDN |
| RabbitMQ | $0.78 | → CloudAMQP 免费 |
| Postgres | $0.17 | 留 |
| Redis-Voxz / Redis / Redis-uGEq | $0.09 / $0.09 / $0.05 | **3 个 Redis,留 1 个** |
| Console / RabbitMQ Web UI | $0.07 / $0.05 | 可删 |
| Live / migrator service | $0.00 | 闲置 |
| **合计** | **$17.04** | |

两条优化路径:

| | 做法 | Plane 项目月费 | 整个工作区账单 |
|---|---|---|---|
| 现状 | — | $17.04 | $23.73($20 Pro 固定费 + $3.73 超额) |
| **A. 只调参(立刻可做)** | `GUNICORN_WORKERS=1` + `CELERY_WORKER_CONCURRENCY=2`,删 2 个多余 Redis / RabbitMQ Web UI | ~$8–10 | ~**$20.00**(超额归零,且留出余量) |
| **B. 全量切换** | A + 单容器 AIO + 队列/存储外置免费 | ~$6–8 | ~$20.00(Pro 封底)/ 若降级 Hobby 可到 ~$13–14 |

> ⚠️ **Pro 计划有 $20/月固定封底**:无论怎么优化,只要留在 Pro,账单最低就是 $20。优化的直接作用是**消掉当前 $3.73 超额并腾出大量余量**(不会因为增长又超支)。想真正压到 $20 以下,需要在用量降下来后**降级到 Hobby**($5/月含 $5 用量),前提是能接受 Hobby 的资源上限且不需要 Pro 的功能。

---

## 6. 取舍与注意事项

- **单容器 = 不能分别扩缩**:某个进程崩了 supervisor 会重启它,但整容器重启会影响全部。对小团队完全够用;真要高并发时再把 api / live 拆回独立服务即可。
- **内存上限**:给这个容器至少配 **1.5–2GB**。`GUNICORN_WORKERS` 和 `CELERY_WORKER_CONCURRENCY` 是主要旋钮,先小后大。
- **构建时间**:一个镜像里 build 了 4 个前端 + 后端,首次构建较久(BuildKit 的 pnpm-store 缓存会让依赖只下一次)。这是**构建期**成本,不是 24h 运行成本。
- **这套 Dockerfile 尚未在 CI 跑过**:按第 3.3 节先本地 `docker build` 验证再上线。
- 队列代码只认 AMQP([`apps/api/plane/settings/common.py`](../../apps/api/plane/settings/common.py) 第 300 行),所以 `AMQP_URL` 必填 —— 但用 CloudAMQP 免费版即可,不必自托管 RabbitMQ。

---

## 文件清单

| 文件 | 作用 |
|------|------|
| [`Dockerfile.aio`](./Dockerfile.aio) | 从本 fork 源码构建的单容器多阶段镜像 |
| [`supervisor.conf`](./supervisor.conf) | 容器内进程编排(api/worker/beat/space/live/caddy) |
| [`Caddyfile`](./Caddyfile) | 单一入口:静态托管 web/admin + 反代其余 |
| [`start.sh`](./start.sh) | 启动:校验 env、派生默认值、拉起 supervisor |
| [`plane.env.example`](./plane.env.example) | 需要在 Railway 配的环境变量清单 |
| [`railway.json`](./railway.json) | Railway config-as-code(指向本 Dockerfile) |
