# 登录跨域与 CORS 设置说明

登录后若出现「又回到输入邮箱」或控制台 `/api/users/me` 返回 401，多半是 **API 和前端不在同一域名**，需要正确配置 **CORS 和 Cookie**。下面说明**在哪里设置**。

---

## 你要设置的是什么

在 **API 后端** 的环境变量里设置：

| 变量名                 | 说明                                                                                                             | 示例                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `CORS_ALLOWED_ORIGINS` | 前端页面的**完整地址**（必须包含协议），多个用英文逗号分隔；且**生产环境必须用 https**，否则登录 cookie 无法跨域 | `https://htjpplane-web-production.up.railway.app` |
| `APP_BASE_URL`         | 前端应用根地址（登录后跳转用）                                                                                   | `https://htjpplane-web-production.up.railway.app` |

---

## 一、用 Railway 部署时（推荐按这个做）

你的前端是 `htjpplane-web-production.up.railway.app`，API 是另一个服务（如 `htj.pplane-api-produc...`），所以要在 **API 这个服务** 里加变量。

1. 打开 [Railway 控制台](https://railway.app/dashboard)，进入你的项目。
2. 点击 **API 后端服务**（不是 Web 前端服务）。
3. 打开 **Variables**（或 **Settings → Environment Variables**）。
4. 新增或编辑：
   - **Name**: `CORS_ALLOWED_ORIGINS`
   - **Value**: 你的**前端**完整地址，例如：
     ```text
     https://htjpplane-web-production.up.railway.app
     ```
     若有多个前端地址，用英文逗号分隔，例如：
     ```text
     https://htjpplane-web-production.up.railway.app,https://www.你的其他域名.com
     ```
5. 再确认有 **APP_BASE_URL**（登录跳转用）：
   - **Name**: `APP_BASE_URL`
   - **Value**: 同上，一般和 CORS 里写的前端地址一致，例如：
     ```text
     https://htjpplane-web-production.up.railway.app
     ```
6. **保存**后，Railway 会重新部署 API；等部署完成再试登录。

注意：**不要写 `http://`**，生产环境必须用 **https**，否则 Session Cookie 的 SameSite=None 不会生效，跨域仍然拿不到 cookie，还是会 401。

---

## 二、用 Docker / 自建服务器时

变量是传给 **API 容器/进程** 的，不是前端。

- **docker-compose**：在 `docker-compose.yml` 里给 API 服务加 `environment`，例如：
  ```yaml
  environment:
    CORS_ALLOWED_ORIGINS: "https://你的前端域名"
    APP_BASE_URL: "https://你的前端域名"
  ```
- **.env 文件**：在 **API 项目根目录**（或你实际读入 env 的目录）的 `.env` 里写：
  ```env
  CORS_ALLOWED_ORIGINS=https://你的前端域名
  APP_BASE_URL=https://你的前端域名
  ```
  然后重启 API 进程/容器。

---

## 三、设置错了会怎样

- **没设 `CORS_ALLOWED_ORIGINS`** 或设成空：API 不会给 Session Cookie 加 `SameSite=None`，浏览器在跨域请求时不会带 cookie → `/api/users/me` 401 → 登录后又被判为未登录，回到邮箱步骤。
- 写了 **`http://`**（生产）：SameSite=None 必须配 Secure，只有 https 才生效 → 同上，仍然 401。
- 只在前端项目里设了 `VITE_API_BASE_URL` 等：那是前端连哪个 API，**不能**代替 API 端的 `CORS_ALLOWED_ORIGINS`。**CORS 和 Cookie 必须在 API 后端设置。**

---

## 四、总结：在哪里设置

- **Railway**：API 服务 → **Variables** → 添加/编辑 `CORS_ALLOWED_ORIGINS` 和 `APP_BASE_URL`。
- **Docker/自建**：API 的 **环境变量** 或 **.env**（给 API 用的那份），不是前端的 .env。

设置正确并重新部署/重启 API 后，再清 cookie 或无痕试一次登录即可。
