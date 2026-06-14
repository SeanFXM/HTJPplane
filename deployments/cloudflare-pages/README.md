# （可选）把 web 静态站甩到 Cloudflare Pages

> **这一步是锦上添花,不是必需。** [`deployments/railway`](../railway) 里的 AIO 容器
> 已经用容器内的 Caddy 免费托管了 web/admin 静态页 —— 成本已接近 0。
> 只有当你还想要 **全球 CDN 加速 + 让 Railway 容器更小** 时,才需要这一步。

`web`(主应用)是 `ssr:false` 的纯静态 SPA,天生适合放 CDN。`admin`(god-mode)
访问量极低,**建议继续留在 AIO 容器里**,不用单独折腾。所以这里只把 **web** 搬到 Pages。

## 推荐做法:同源 + Worker 反代(无 CORS、换域名不用重构建)

思路:用户访问的域名挂在 Cloudflare 上;`web` 的静态资源由 Pages CDN 直出,
而 `/api`、`/auth`、`/spaces`、`/live`、`/god-mode` 这些后端路径由一个
[`_worker.js`](./_worker.js) 透明反代到 Railway 的 AIO 容器。前端始终是相对路径,
所以**永远不用因为换域名而重新构建**,也没有跨域问题。

```bash
# 1) 构建(同源模式,base URL 留空)
deployments/cloudflare-pages/build.sh

# 2) 把 worker 放进产物根目录,然后整个目录就是一个 Pages 项目
cp deployments/cloudflare-pages/_worker.js deployments/cloudflare-pages/dist/web/

# 3) 部署(用 wrangler,或在 Pages 控制台拖拽 dist/web 目录)
npx wrangler pages deploy deployments/cloudflare-pages/dist/web --project-name plane-web
```

然后在 **Pages 项目 → Settings → Environment variables** 里加:

```
BACKEND_URL = https://<你的-railway-域名>
```

最后把你的自定义域名绑到这个 Pages 项目上即可。Railway 容器仍然在跑(api/space/live/admin),
只是 web 的静态流量被 CDN 接管了。

## 备选做法:跨域(更简单,但有 CORS、换域名要重构建)

如果不想用 Worker,可以把后端地址直接编译进包里:

```bash
MODE=cross-origin BACKEND_URL=https://<railway-域名> deployments/cloudflare-pages/build.sh
npx wrangler pages deploy deployments/cloudflare-pages/dist/web --project-name plane-web
```

代价:
- 必须在 Railway 后端把 Pages 域名加进 `CORS_ALLOWED_ORIGINS`。
- Railway 域名一变,就得重新构建上传。

## 文件

| 文件 | 作用 |
|------|------|
| [`build.sh`](./build.sh) | 构建 web/admin 静态包到 `dist/`,并写好 SPA fallback(`_redirects`) |
| [`_worker.js`](./_worker.js) | Pages 高级模式 worker:静态直出 + 后端路径反代到 Railway |

> 不确定要不要做这步?**那就先不做。** 先把 AIO 容器跑稳、把账单降下来,
> 之后真觉得 web 首屏需要 CDN 加速了,再回来 10 分钟搞定。
