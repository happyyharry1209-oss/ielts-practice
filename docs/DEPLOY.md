# 部署上線

架構只有三塊：

```
GitHub Pages  ──(HTTPS + CORS)──▶  Render (API)  ──▶  Postgres (Neon / Supabase)
  前端靜態檔                         Node + Hono         使用者資料、題庫不進 DB
```

> GitHub Pages 不能跑 Node，所以 API 一定要放在別的地方。前端、後端、資料庫是三個獨立步驟。

---

## 0. 先確認本機是最新狀態

```powershell
cd "C:\Users\user\OneDrive\Desktop\deepseek harness\ielts-practice"
git status
npm run typecheck; npm test; npm run validate:content
```

三個都綠再往下。

---

## 1. 推到 GitHub

**免費帳號的 GitHub Pages 只能從 public repo 發佈。** 所以 repo 要設成 public。

```powershell
# 在 GitHub 建一個空的 public repo（不要勾 Add README）
git remote add origin https://github.com/<你的帳號>/ielts-practice.git
git branch -M main
git push -u origin main
```

建好後：

1. Repo → **Settings → Pages → Source** 選 **GitHub Actions**（不是 "Deploy from a branch"）
2. 先不要設 `VITE_API_URL`，等 API 部署完再回來設

第一次 push 會觸發 `deploy-web.yml`，但因為還沒有 API 網址，網站會打得開、登入會失敗。這是預期的。

> 如果你的 repo 叫 `<帳號>.github.io`（個人首頁），workflow 算出的 base 會是錯的。那種情況請在
> `.github/workflows/deploy-web.yml` 把 `VITE_BASE` 改成 `/`。

---

## 2. 建 Postgres

三個選項都可以，挑一個：

| 服務 | 免費額度 | 備註 |
|---|---|---|
| **Neon**（建議） | 0.5 GB，閒置會睡 | 連線字串直接可用，不需要 card |
| Supabase | 500 MB | 免費專案一週沒用會暫停 |
| Render Postgres | 1 GB，30 天後到期 | 過期要重開，不適合長期 |

建立後複製 **connection string**，補上 `?sslmode=require`，例如：

```
postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
```

在**本機**跑一次 migration（在 repo 目錄）：

```powershell
$env:DATABASE_URL="postgresql://...?sslmode=require"
npm run db:migrate
```

看到 `✔ schema applied (postgres)` 就成功。

---

## 3. 部署 API 到 Render

1. Render → **New → Blueprint** → 選你的 repo（會讀 `render.yaml`）→ Apply
2. 在服務的 **Environment** 補上：

| 變數 | 值 |
|---|---|
| `DATABASE_URL` | 第 2 步的連線字串 |
| `CORS_ORIGIN` | `https://<你的帳號>.github.io`（只到 origin，不要加路徑、不要加斜線） |
| `APP_URL` | `https://<你的帳號>.github.io/<repo>`（驗證信／重設信裡的連結會用到，**一定要設**） |
| `RESEND_API_KEY` | 可選；不填就把驗證／重設連結印在 Render log |
| `DEEPSEEK_API_KEY` | 可選；不填就用規則型評分 |

`JWT_SECRET` 由 `render.yaml` 自動產生，不用手動設。

> 沒有 `RESEND_API_KEY` 時，註冊不會真的寄信，但帳號仍可登入（會顯示「未驗證」提示條）；
> 忘記密碼則需要管理員從 Render log 取連結，或直接用 `seed:admin` 重設密碼。

3. Deploy 完打開 `https://<service>.onrender.com/api/health`，應該看到：

```json
{ "ok": true, "db": true, "engine": "postgres", "ai": false }
```

- `db: false` → `DATABASE_URL` 錯，或資料庫擋了外網
- 服務啟動失敗且 log 說 `JWT_SECRET must be set` → 確認環境變數有生效

> Render 免費方案 15 分鐘沒人用會休眠，下一次請求要等 30–50 秒。這是正常的，不是壞掉。

---

## 4. 在正式資料庫建立管理員

**這步一定要做**，不然你只有一般使用者，看不到 Admin 後台。在**本機**跑：

```powershell
$env:DATABASE_URL="postgresql://...?sslmode=require"
$env:ADMIN_EMAIL="你的信箱@example.com"
$env:ADMIN_PASSWORD="至少十個字的密碼"
npm run seed:admin
```

腳本會印出 `✔ admin account created`。密碼只存在資料庫，不會進 git。

---

## 5. 讓前端指到 API

1. Repo → **Settings → Secrets and variables → Actions → New repository secret**
   - Name：`VITE_API_URL`
   - Value：`https://<service>.onrender.com`（**不要**加結尾斜線、不要加 `/api`）
2. 到 **Actions → Deploy web to GitHub Pages → Run workflow** 重跑一次

完成後網址是：

```
https://<你的帳號>.github.io/ielts-practice/
```

---

## 6. 上線檢查清單

用無痕視窗走一遍：

- [ ] 首頁打得開、樣式正常（沒有 404 的 assets）
- [ ] 註冊一個新帳號 → 登入成功
- [ ] 閱讀：切「下一篇」、點第 27 題會跳到 Passage 3
- [ ] 聽力：音檔可以播放（Pages 有正確的 base path）
- [ ] 交卷 → 成績頁顯示分數與逐題解析
- [ ] 寫作 → 取得回饋（沒有 key 會標 **Offline**，這是正常的）
- [ ] 口說 → 麥克風權限允許後可以錄音、回放
- [ ] 用 admin 登入 → 導覽列有 **Admin**，後台看得到資料

---

## 7. 常見錯誤

| 症狀 | 原因 | 解法 |
|---|---|---|
| 頁面空白、assets 404 | Pages 還是 branch 模式，或 repo 改了名 | Settings → Pages 改 **GitHub Actions**，重跑 workflow |
| 登入時 "Cannot reach the server" | `VITE_API_URL` 沒設或設完沒重跑 workflow | 設 secret → 重跑 Actions |
| 瀏覽器 CORS 錯誤 | `CORS_ORIGIN` 不是精確 origin | 只填 `https://user.github.io`，重新部署 API |
| API 503 `Database unavailable` | `DATABASE_URL` 錯 / 資料庫暫停 | 檢查連線字串、到資料庫後台喚醒 |
| 第一次請求很慢 | Render 免費層休眠 | 正常；可加 cron-job.org 每 10 分鐘 ping `/api/health` |
| 音檔 404 | 用 `*.github.io` 當 repo 名導致 base 錯 | 把 `VITE_BASE` 改成 `/` |
| 管理員登不進去 | 沒在正式 DB 跑 seed | 重做第 4 步（記得 `DATABASE_URL` 指向正式庫） |

---

## 8. 成本

| 項目 | 免費額度 | 超過之後 |
|---|---|---|
| GitHub Pages | 公開 repo 無限流量（軟上限 100 GB/月） | 幾乎不會碰到 |
| Render Web Service | 750 小時/月，會休眠 | $7/月起 |
| Neon / Supabase | 0.5 GB / 500 MB | $19–25/月起 |
| DeepSeek（可選） | 按用量 | 一篇作文約 $0.001–0.005 |

個人使用 + 少量朋友：**$0/月**。

---

## 9. 之後要更新

```powershell
git add -A
git commit -m "新增一套閱讀題"
git push
```

- 前端：Actions 自動重新部署
- 後端：Render 偵測到 push 自動重新部署
- 題庫：`content/` 改動會被 API 直接讀到（不需要 migration）

---

## 10. 其他後端選擇

如果不想用 Render：

- **Fly.io**：免費額度已縮水，需要信用卡
- **Railway**：試用額度用完要付費
- **Cloudflare Workers**：要改寫 Hono 的 runtime adapter，不建議現在做
- **自架 VPS**：`npm run build:api` 後 `node apps/api/dist/index.js`，用 pm2/systemd 顧

Render 是設定最少、跟目前 repo 最合的路。
