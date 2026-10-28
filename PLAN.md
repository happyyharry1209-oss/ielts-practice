# IELTS 練習網站 — 完整開發計劃

> 版本：v0.1（計劃稿）
> 目標：做一個可長期使用、能部署上 GitHub 的 IELTS 四項全練習網站
> 語言：介面中英雙語切換（i18n），題目英文

---

## 0. 先講結論（你選的路線與現實限制）

你選了「前端 + 後端」，並要「部署上 GitHub」。這裡有一個必須先講清楚的事實：

**GitHub Pages 只能托管靜態檔案，不能跑後端。**
所以架構會拆成兩塊：

| 部分 | 放哪裡 | 說明 |
|---|---|---|
| 前端（React SPA） | **GitHub Pages** | 免費、跟 GitHub repo 一鍵部署，這是你「部署上 GitHub」的部分 |
| 後端（API） | **Render / Fly.io 免費方案** | 不能放 GitHub Pages，但有免費層；主要用來保護 AI key、存錄音 |
| 資料庫 + 檔案儲存 | **Supabase 免費層** | Postgres + Storage，取代自建 DB，省很多事 |

這樣做的好處：前端完全在 GitHub 上、可公開分享；後端只是一個很薄的 API，不影響你 `git push` 的體驗。
如果你**堅持全部都要在 GitHub 上**（例如學校功課要交單一 repo），那就要退一步：把 AI 批改改成「前端呼叫使用者自己輸入的 API key」，後端只留可選。這個 trade-off 我會在 §9 再講一次。

---

## 1. 產品目標與範圍

### 1.1 要解決什麼問題
- 市面 IELTS 練習網站多數只做單項（如只做閱讀），或要付費訂閱。
- 你需要一個**四項都有、能記錄進度、能給回饋**的自用練習站。
- 之後可能公開或部署到 GitHub，所以要「乾淨的開源專案結構」。

### 1.2 第一版（MVP）範圍

| 模組 | MVP 有 | MVP 不做（第二階段） |
|---|---|---|
| Listening | 4 sections、40 題、音檔、計時、自動評分 | 音檔變速、逐句字幕 |
| Reading | 3 passages、40 題、計時、自動評分 | 智能出題 |
| Writing | Task 1 + Task 2、計時、草稿自動儲存、AI 評分 | 真人批改、範文庫 |
| Speaking | Part 1–3 題庫、準備/作答計時、錄音、回放 | AI 口語評分（見 §6）、發音糾正 |
| 帳號 | Email + 密碼（Supabase Auth） | 第三方登入（Google/GitHub） |
| 儀表板 | 各項最佳分數、練習歷史、錯題本 | 社群、排行榜 |
| 雙語 | 中/英切換（介面） | 題目翻譯（不應該翻題目，會誤導） |
| 部署 | GitHub Pages（前端）+ Render（後端） | 自訂網域 |

**重要設計原則**：閱讀/聽力的題目**不要翻譯成中文**。IELTS 考的是英文理解，翻成中文就失去練習意義。雙語只用在介面、指示、回饋解釋。

---

## 2. 四項功能詳細設計

### 2.1 Listening（聽力）

**結構**：4 個 Section，共 40 題，約 30 分鐘 + 10 分鐘填答時間。

- Section 1：日常對話（填表/填地址，數字、拼寫、日期）
- Section 2：獨白（地圖/平面圖標記、多選）
- Section 3：學術討論（多選、配對）
- Section 4：學術講座（填空）

**功能**：
1. 一次性播放（模擬真實考試，不給回放按鈕）→ 可設定「練習模式允許回放」
2. 每題有作答區，題目按 section 滾動
3. 音檔：MP3/OGG 放 Supabase Storage 或 repo 的 `public/audio`
4. 計時器：總時長倒數 + 最後 10 分鐘提醒
5. 自動評分：標準答案比對（正規化：大小寫、單複數、連字號、英美拼法）
6. 交卷後顯示：正確率、每題標示正確/錯誤、原文 transcript（可開關）

**填空題判分要注意的細節**（很容易做錯）：
- `answers` 支援多個可接受答案陣列：`["colour", "color"]`
- 忽略開頭/結尾空白、大小寫
- 數字答案：`15` 與 `fifteen` 是否等價 → 用 `acceptedAnswers` 明確列出，不要自動推斷
- 「NO MORE THAN TWO WORDS」限制 → 超過字數直接不給分（要在 UI 提示）

### 2.2 Reading（閱讀）

**結構**：3 篇 Passage，共 40 題，60 分鐘。學術組文章約 2,150–2,750 字。

**題型（第一版要做齊的 11 種）**：
1. Multiple choice（單選、多選）
2. True / False / Not Given
3. Yes / No / Not Given
4. Matching headings
5. Matching information（段落資訊配對）
6. Matching features（人物/類別配對）
7. Matching sentence endings
8. Sentence completion
9. Summary completion（有/無字庫）
10. Note/table/flow-chart completion
11. Diagram label completion
12. Short answer questions

**功能**：
1. 左文右題雙欄（手機自動上下切換）
2. 文章可反白標記（highlight）與筆記
3. 每個 Passage 獨立計時顯示（可切換）
4. 交卷後：答案對錯、每題解析（`explanation` 欄位）、定位句標示
5. 模擬模式（60 分鐘硬性倒數）vs 練習模式（無時限）

> 雙欄閱讀器的效能要小心：文章用 `content-visibility` 或分段渲染，不要 3 篇 2,500 字全 DOM 一次掛上。

### 2.3 Writing（寫作）

**結構**：
- Task 1（150 字以上，20 分鐘）：圖表描述（線圖/柱狀/餅圖/流程圖/地圖）
- Task 2（250 字以上，40 分鐘）：議論文

**功能**：
1. 題目卡 + 計時（可選 60 分鐘合併模式或分開模式）
2. 富文字編輯器（其實**純文字就好**，IELTS 是手寫；不需要粗體）
3. **自動儲存**（每 5 秒 debounce → localStorage + 後端），避免當機丟稿
4. 即時字數統計 + 分段統計
5. 提交後 AI 評分（見 §6）：
   - Task 1：Task Achievement、Coherence & Cohesion、Lexical Resource、Grammatical Range & Accuracy
   - Task 2：Task Response（對應 TA）
   - 每項 0–9 分（0.5 進位），給出總分與每項理由
   - 標出文法錯誤的句子（原文 + 建議改寫）
   - 給出可替換的高分詞彙/句型建議
6. 歷史版本對照（同一題重寫，看進步）

**AI 評分的可靠性限制（必須老實寫在 UI）**：
- AI 給的分數**僅供參考**，不能當作真實 IELTS 分數。
- 真正的人工考官會看手寫、邏輯、語氣；AI 容易「過度寬容」。
- 建議 UI 上標示「AI estimated band ±0.5–1.0」。

### 2.4 Speaking（口語）

**MVP：題庫 + 計時 + 錄音 + 回放，不做自動評分。**

**結構**：
- Part 1（4–5 分鐘）：日常話題，8–12 題
- Part 2（3–4 分鐘）：Cue card，1 分鐘準備 + 2 分鐘獨白
- Part 3（4–5 分鐘）：深入討論

**功能**：
1. 隨機抽題 / 按主題選題
2. Part 2 專用流程：抽卡 → 1 分鐘準備（顯示倒數 + 筆記區）→ 自動開始 2 分鐘錄音
3. 錄音：`MediaRecorder` API，格式 webm/opus（Safari 需 fallback）
4. 本地先存（IndexedDB），再上傳（避免上傳失敗丟檔）
5. 回放 + 刪除
6. （第二階段）AI 轉錄 + 流利度分析（語速、停頓、重複詞）

**技術地雷**：
- iOS Safari 的 `MediaRecorder` 支援有限，要用 `audio/webm` 偵測 + fallback 到 `audio/mp4`
- 需要 HTTPS 才能用麥克風 → GitHub Pages 是 HTTPS，沒問題；本機 `localhost` 也可以
- 錄音檔大小：2 分鐘 webm 約 1–2 MB，上傳前可壓縮或直接存 Supabase Storage

---

## 3. 技術架構

```
┌─────────────────────────────────────────────┐
│  Frontend (React 19 + Vite + TS)            │
│  GitHub Pages  https://<user>.github.io/... │
│  - i18next 中英切換                         │
│  - Tailwind + shadcn/ui                     │
│  - Zustand（作答狀態）+ TanStack Query（API）│
└──────────────────┬──────────────────────────┘
                   │ HTTPS
┌──────────────────▼──────────────────────────┐
│  Backend (Node 22 + Hono)                   │
│  Render Free / Fly.io                       │
│  - /api/auth (Supabase JWT 驗證)            │
│  - /api/attempts (交卷、評分)               │
│  - /api/ai/writing-score (AI proxy)         │
│  - /api/ai/transcribe (Whisper proxy)       │
│  - /api/audio (簽名上傳 URL)                │
└──────┬───────────────────────┬──────────────┘
       │                       │
┌──────▼──────┐        ┌───────▼──────────────┐
│ Supabase    │        │ AI APIs              │
│ - Postgres  │        │ - DeepSeek/OpenAI    │
│ - Auth      │        │   (writing score)    │
│ - Storage   │        │ - Whisper (轉錄)     │
└─────────────┘        └──────────────────────┘
```

### 3.1 選型理由

| 層 | 選擇 | 為什麼 |
|---|---|---|
| 前端框架 | React 19 + Vite + TypeScript | 生態最大、你之後想改容易、Vite 部署 GitHub Pages 很順 |
| 樣式 | Tailwind CSS + shadcn/ui | 不用自己刻元件，深色模式免費 |
| 路由 | React Router v7，**用 `HashRouter`** | GitHub Pages 不支援 SPA fallback；Hash 路由最省事（`/#/practice/reading`） |
| 狀態 | Zustand | 作答狀態（答案、標記、計時）很適合放 store |
| 資料層 | TanStack Query | API 快取、重試、loading 狀態 |
| i18n | i18next + react-i18next | 中/英 JSON 檔，支援插值與複數 |
| 後端 | Hono（Node 22） | 極輕、啟動快、TypeScript 原生、Render 免費層跑得動 |
| ORM | Drizzle | 比 Prisma 輕，適合免費層；但 Prisma 也 OK |
| DB | Supabase（Postgres） | 免費 500 MB、內建 Auth/Storage、RLS 權限 |
| AI | DeepSeek（寫作）+ OpenAI Whisper（轉錄） | DeepSeek 便宜、中文解釋好；Whisper 轉錄準 |
| 測試 | Vitest + Playwright | 單元測試判分邏輯，E2E 測答題流程 |
| CI/CD | GitHub Actions | build + deploy Pages；backend 用 Render 自動部署 |

### 3.2 關鍵架構決策

**決策 1：題目存在哪裡？**
- 題目本身（文章、音檔、答案）→ **放 repo 的 `content/` 目錄，build 時打包進前端**。
  - 好處：零 DB 成本、可 version control、GitHub 上直接看 diff。
  - 壞處：加題要重新 build/deploy（可接受）。
- 使用者資料（作答、分數、錄音）→ **放 Supabase**。
- 這樣題庫是「靜態資料」，不是資料庫資料。**不要**把題目塞進 Postgres，會讓內容維護變痛苦。

**決策 2：AI key 放哪？**
- 絕對**不能**放前端（會被偷）。
- 放 Render 的環境變數，前端只能打你的後端。
- 後端要**限流**（同一使用者每分鐘 N 次、每日總量上限），否則被掃到就破產。

**決策 3：音檔放哪？**
- 示範音檔 → `public/audio/`（小，可進 repo，但注意 repo 大小）
- 使用者錄音 → Supabase Storage（不進 repo）
- 大音檔用 Git LFS 或直接放 Supabase Storage + public URL

---

## 4. 資料模型

### 4.1 題庫（靜態 JSON / YAML）

```jsonc
// content/reading/test-001.json
{
  "id": "reading-001",
  "title": "The History of Tea",
  "type": "academic",
  "durationSec": 3600,
  "passages": [
    {
      "id": "p1",
      "title": "Tea in Ancient China",
      "body": "markdown string...",
      "questions": [
        {
          "id": "q1",
          "type": "true-false-not-given",
          "number": 1,
          "prompt": "Tea was first discovered in India.",
          "options": ["TRUE", "FALSE", "NOT GIVEN"],
          "answer": "FALSE",
          "explanation": "The passage states tea originated in China...",
          "location": "Passage 1, paragraph 1"
        },
        {
          "id": "q2",
          "type": "multiple-choice",
          "number": 5,
          "prompt": "What does the writer say about...",
          "options": ["A ...", "B ...", "C ...", "D ..."],
          "answer": "B"
        }
      ]
    }
  ]
}
```

**題型 enum**（前後端共用 TypeScript 型別）：
```ts
type QuestionType =
  | 'multiple-choice' | 'multiple-answer' | 'true-false-not-given'
  | 'yes-no-not-given' | 'matching-headings' | 'matching-information'
  | 'matching-features' | 'matching-sentence-endings'
  | 'sentence-completion' | 'summary-completion' | 'table-completion'
  | 'flowchart-completion' | 'diagram-labelling' | 'short-answer'
  | 'note-completion' | 'form-completion' | 'map-labelling' | 'plan-labelling';
```

**建議格式**：題目用 **YAML**（人類好寫、可加註解），build 時轉 JSON。或 JSON + JSON Schema 驗證。

### 4.2 使用者資料（Postgres / Drizzle）

```ts
users            // 由 Supabase Auth 管理，這裡只存 profile
  id, email, display_name, created_at

attempts         // 一次完整練習
  id, user_id, module ('listening'|'reading'|'writing'|'speaking'),
  content_id, mode ('mock'|'practice'), started_at, submitted_at,
  duration_sec, band_score, raw_score, meta jsonb

responses        // 聽/讀的每題作答
  id, attempt_id, question_id, answer jsonb, is_correct, time_spent_sec

writing_submissions
  id, user_id, task_type (1|2), prompt_id, text, word_count,
  submitted_at, ai_feedback jsonb, ai_band numeric

speaking_recordings
  id, user_id, part (1|2|3), cue_card_id, audio_path,
  duration_sec, transcript text (nullable), created_at

ai_usage         // 限流與成本追蹤
  id, user_id, endpoint, tokens_in, tokens_out, cost_usd, created_at
```

**RLS 規則**：每個表 `user_id = auth.uid()` 才能讀寫，除了題庫（不過題庫在前端，不在 DB）。

---

## 5. 目錄結構

```
ielts-practice/
├── .github/workflows/
│   └── deploy.yml              # build + deploy 到 GitHub Pages
├── apps/
│   ├── web/                    # 前端
│   │   ├── src/
│   │   │   ├── app/            # 路由、layout、providers
│   │   │   ├── components/     # 共用 UI（Button, Timer, AudioPlayer...）
│   │   │   ├── features/
│   │   │   │   ├── listening/
│   │   │   │   ├── reading/
│   │   │   │   ├── writing/
│   │   │   │   ├── speaking/
│   │   │   │   └── dashboard/
│   │   │   ├── lib/            # api client, storage, scoring utils
│   │   │   ├── i18n/
│   │   │   │   ├── locales/en.json
│   │   │   │   └── locales/zh-TW.json
│   │   │   └── content/        # 題庫（build 時 import）
│   │   ├── public/audio/
│   │   └── vite.config.ts
│   └── api/                    # 後端
│       ├── src/
│       │   ├── routes/
│       │   │   ├── attempts.ts
│       │   │   ├── writing.ts
│       │   │   ├── speaking.ts
│       │   │   └── health.ts
│       │   ├── lib/            # supabase client, ai clients, scoring
│       │   └── index.ts
│       └── drizzle/
├── packages/
│   └── shared/                 # 前後端共用型別、判分邏輯
│       ├── types/
│       └── scoring/
├── content/                    # 題庫來源（YAML/Markdown）
│   ├── listening/
│   ├── reading/
│   ├── writing/
│   ├── speaking/
│   └── schema.json
├── scripts/
│   ├── validate-content.ts     # 驗證題庫格式
│   └── generate-content.ts     # AI 生成題庫草稿
├── docs/
│   └── PLAN.md                 # 本文件
├── pnpm-workspace.yaml
└── README.md
```

**monorepo 用 pnpm workspace**：前端、後端、共用型別各自獨立，但共用 `packages/shared` 的判分邏輯（避免前後端各寫一份，結果不一致）。

---

## 6. AI 功能設計

### 6.1 寫作評分 Prompt 架構

三層 prompt，減少幻覺：

```
System: You are a certified IELTS examiner...
  → 給定 official band descriptors 摘要（0–9 每項的關鍵描述）
User:
  1. Task type (1/2) + prompt
  2. Candidate essay
  3. 要求輸出 JSON（zod schema 驗證）
```

輸出 JSON schema（用 zod 驗證，失敗就重試一次）：
```json
{
  "taskAchievement": { "band": 6.5, "comments": "..." },
  "coherence": { "band": 7.0, "comments": "..." },
  "lexical": { "band": 6.0, "comments": "..." },
  "grammar": { "band": 6.5, "comments": "..." },
  "overall": 6.5,
  "errors": [
    { "sentence": "...", "issue": "...", "suggestion": "..." }
  ],
  "vocabularyUpgrades": [
    { "original": "very big", "better": "substantial", "why": "..." }
  ]
}
```

**成本控制**：
- 用 DeepSeek（每百萬 token 約 $0.3–1）→ 一篇作文約 1,000–2,000 token，成本 < $0.005
- 每次提交前檢查 `ai_usage` 日/週上限
- 快取：同 user + 同 essay hash 不重複評分

### 6.2 口語轉錄（第二階段）
- Whisper API：$0.006/分鐘 → 2 分鐘約 $0.012
- 或本地 whisper.cpp（免費但要後端 CPU，免費層跑不動，不建議）

### 6.3 AI 生成題庫（你要的「兩者都要」）

`scripts/generate-content.ts` 流程：
1. 指定題型、主題、難度、字數
2. 呼叫 LLM 生成 JSON（題目 + 答案 + 解析）
3. **自動驗證**：`validate-content.ts` 檢查 schema、答案是否在文章中可定位
4. **人工審核**：輸出到 `content/drafts/`，你先看過再移到 `content/`
5. 音檔（聽力）→ 用 TTS（Edge TTS 免費）生成示範音檔

**重要**：AI 生成的閱讀題常有「答案無法從文中推出」的問題。驗證腳本要能抓出：
- 答案關鍵字不在文章裡 → 標記待審
- TRUE/FALSE/NOT GIVEN 題的答案分佈太偏（例如 80% 是 NOT GIVEN）→ 警告

### 6.4 版權與合規（不能省）
- **絕對不要**放真題（Cambridge IELTS 1–19 有版權，公開網站會收律師信）。
- 自寫題目 + AI 生成題目 + 標明「模擬題，非官方真題」。
- 網站 footer 加免責聲明：「This site is not affiliated with the IELTS test. IELTS is a registered trademark of the British Council, IDP, and Cambridge University Press & Assessment.」
- 音檔：自錄或 TTS 生成，不要用 YouTube 音檔。

---

## 7. 開發階段（Roadmap）

以「每週 10–15 小時」估算。若你全職做，可壓縮到 3 週。

### Phase 0：基礎建設（3–5 天）
- [ ] `pnpm create vite` + React/TS + Tailwind + shadcn
- [ ] monorepo 結構（pnpm workspace）
- [ ] i18n 骨架（中/英，先各 50 個 key）
- [ ] GitHub repo + Actions → Pages 自動部署（先放一個 Hello World 驗證）
- [ ] Supabase 專案建立（Auth + DB schema + RLS）
- [ ] 後端 Hono 骨架 + `/health` + Render 部署
- [ ] **驗收**：`git push` 後網站自動更新；後端 `/health` 回 200

### Phase 1：聽力 + 閱讀（1–1.5 週）★ 核心
- [ ] `packages/shared`：QuestionType 型別 + 判分函式（含正規化、多答案、字數限制）
- [ ] 題庫 schema + `validate-content.ts`
- [ ] 手寫 1 套示範閱讀（3 篇、40 題）+ 1 套聽力（4 section、40 題）
- [ ] 閱讀雙欄作答 UI + 標記/筆記
- [ ] 聽力音檔播放器 + 一次性播放限制
- [ ] 通用計時器（mock/practice 模式）
- [ ] 交卷 → 自動評分 → 成績頁（正確率、逐題解析）
- [ ] 作答狀態持久化（重整不丟答案）
- [ ] **驗收**：完整做完一套閱讀與一套聽力，分數正確，手機可用

### Phase 2：寫作 + 口語（1–1.5 週）
- [ ] 寫作編輯器 + 字數統計 + 自動儲存
- [ ] Task 1/Task 2 計時流程
- [ ] 寫作提交 → 後端 → AI 評分 → 顯示四項分數 + 錯誤標註
- [ ] AI 輸出 zod 驗證 + 重試 + 錯誤處理
- [ ] 口語題庫（Part 1–3 各 10 組）
- [ ] 錄音（MediaRecorder + IndexedDB + 上傳）
- [ ] Part 2 準備/作答計時器
- [ ] **驗收**：寫一篇 Task 2 拿到 AI 分數；錄一段 Part 2 能回放

### Phase 3：儀表板 + 打磨（5–7 天）
- [ ] 登入/註冊頁（Supabase Auth）
- [ ] 儀表板：各項最佳分、練習歷史、錯題本
- [ ] 設定頁：語言、深色模式、練習模式偏好
- [ ] 空狀態、loading、錯誤頁（不要讓使用者看到白屏）
- [ ] 無障礙（鍵盤導航、aria label、對比度）
- [ ] 響應式檢查（375px / 768px / 1280px）
- [ ] Playwright E2E：完成一套閱讀 → 分數正確
- [ ] README + 部署文件

### Phase 4：擴充（之後）
- [ ] 更多題庫（目標：閱讀 10 套、聽力 10 套、寫作 30 題、口語 50 組）
- [ ] 口語 AI 轉錄 + 流利度分析
- [ ] 單字本（點文章單字查詢 + 收藏）
- [ ] 錯題重練模式
- [ ] 學習曲線圖表（recharts）
- [ ] PWA（可離線練習聽力/閱讀）
- [ ] 匯出 PDF 成績報告

**總計 MVP：約 3–4 週**（不含大量題庫撰寫）

---

## 8. 部署方案

### 8.1 GitHub Pages（前端）

`vite.config.ts`：
```ts
export default defineConfig({
  base: '/ielts-practice/',   // repo 名稱，很重要
  plugins: [react()],
})
```

`.github/workflows/deploy.yml`：
```yaml
name: Deploy to GitHub Pages
on:
  push: { branches: [main] }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v3
        with: { version: 9 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter web build
        env:
          VITE_API_URL: ${{ secrets.VITE_API_URL }}
      - uses: actions/upload-pages-artifact@v3
        with: { path: apps/web/dist }
  deploy:
    needs: build
    permissions: { pages: write, id-token: write }
    environment: github-pages
    runs-on: ubuntu-latest
    steps:
      - uses: actions/deploy-pages@v4
```

**注意**：
1. repo → Settings → Pages → Source 選「GitHub Actions」
2. `base` 一定要改成你的 repo 名，否則資源 404
3. 用 `HashRouter`，否則直接開 `/practice/reading` 會 404（GitHub Pages 不支援 rewrite）
4. API URL 放 GitHub Secrets，不要 commit

### 8.2 Render（後端）
- 建立 Web Service，連 GitHub repo，root 設 `apps/api`
- Build：`pnpm install && pnpm --filter api build`
- Start：`node apps/api/dist/index.js`
- 環境變數：`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`DEEPSEEK_API_KEY`、`OPENAI_API_KEY`、`CORS_ORIGIN`
- 免費層 15 分鐘沒人用會休眠 → 第一次請求慢 30 秒（可接受；或用 cron-job.org 定期 ping）

### 8.3 成本估算（月）

| 項目 | 免費層 | 超過 |
|---|---|---|
| GitHub Pages | 無限（1 GB repo） | — |
| Render | 750 小時/月 | $7/月起 |
| Supabase | DB 500 MB、Storage 1 GB | $25/月起 |
| DeepSeek | 按量 | 約 $0.005/篇 |
| Whisper | 按量 | $0.006/分鐘 |

**個人自用 + 少量朋友：$0/月**。公開流量大才需要付費。

---

## 9. 風險與待決策

| 風險 | 影響 | 對策 |
|---|---|---|
| GitHub Pages 不能跑後端 | 需額外主機 | 已拆架構；或改 Cloudflare Pages（支援 Functions） |
| AI 分數不準 | 誤導使用者 | UI 標示「estimated」；提供 rubric 讓使用者自己對照 |
| API key 被盜用 | 帳單爆炸 | 後端代理 + 每 user 限流 + 每日上限 |
| 題庫版權 | 法律風險 | 只放自寫/AI 生成題，加免責聲明 |
| Render 免費層休眠 | 首次載入慢 | 定期 ping；或升級 $7 |
| iOS 錄音相容性 | 口語功能壞掉 | 偵測支援 + fallback + 明確錯誤訊息 |
| 題庫太少 | 練兩次就膩 | Phase 4 補題；先確保格式好寫，補題成本低 |
| 手機雙欄閱讀難用 | 體驗差 | 手機改上下切換 + 字體大小調整 |

### 9.1 已定案（2026-04 更新）

| 決策 | 結果 |
|---|---|
| 後端 | **要**。前端 GitHub Pages + 後端 Render/Fly + Supabase Postgres |
| 帳號 | **要登入、要存進度**，並提供一個 **admin/開發者帳號** |
| 題庫 | 第一版 **1 套閱讀 + 1 套聽力**（格式先做對，之後補題） |
| 部署 | 前端 GitHub Pages；後端另外托管；資料庫 Supabase |

### 9.2 管理員帳號的正確做法（安全性）

**不要**把 admin 帳號密碼寫死在程式碼或 commit 進 repo。公開 repo 等於公開密碼。

採用三層做法：

1. **角色欄位**：`users.role` 加 `'user' | 'admin'`，預設 `'user'`。
2. **Seed 腳本吃環境變數**：`scripts/seed-admin.ts` 從 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 讀取，只在資料庫裡沒有 admin 時建立。重跑不會覆蓋密碼（避免手滑重置）。
3. **密碼只存在後端**：用 `node:crypto` 的 `scrypt` 雜湊（不引入 native 依賴），JWT 由後端自己簽（`jose`），前端只存 token。

管理員後台（第一版最小功能）：
- 使用者列表（email、角色、註冊時間、練習次數）
- 可將使用者設為 admin / 停用
- AI 用量統計（tokens、成本、每人每日上限）
- 題庫上架狀態（讀 `content/` 目錄的 manifest）

> 如果日後改用 Supabase Auth，admin 用 `user_metadata.role` 或獨立的 `admin_users` 表，原則相同：**憑證只存在伺服器端環境變數，不進版控**。

---

## 10. 下一步（我可以直接幫你做的）

按優先順序：

1. **建 repo 骨架**：pnpm monorepo + Vite + TS + Tailwind + i18n + HashRouter，跑得起來
2. **寫共用判分邏輯**：`packages/shared/scoring` + Vitest 測試（這是最容易出錯、最值得先做對的部分）
3. **定題庫 schema** + 寫一份 `validate-content.ts` + 一套示範閱讀題
4. **做閱讀作答頁**：雙欄、標記、計時、交卷、成績頁
5. **GitHub Actions 部署**：先部署 Hello World 驗證 pipeline

我建議從 **1 → 2 → 3** 開始，因為判分邏輯和題庫格式一旦定好，後面所有模組都靠它。

---

*本計劃為草案，可依你的回饋調整。*

---

## 11. 實作進度（已完成）

計劃已落地為可運行的程式碼，第一版 MVP 完成。

### 已完成

| 模組 | 狀態 |
|---|---|
| 前端 React 19 + Vite + TS + Tailwind + HashRouter | ✅ 建置通過（4 MB dist，含音檔） |
| 中英雙語介面（i18next，約 130 條字串） | ✅ |
| 登入 / 註冊 / JWT / scrypt 密碼雜湊 | ✅ |
| 管理員角色 + 最小管理後台（使用者、用量、題庫統計） | ✅ |
| 聽力：4 section、40 題、音檔、計時、交卷評分 | ✅ 音檔已用 SAPI 生成（3.5 MB MP3） |
| 閱讀：3 篇、40 題、雙欄、題號導航、交卷評分 | ✅ |
| 寫作：Task 1/2、字數、草稿自動儲存、AI 或規則型評分 | ✅ |
| 口說：Part 1–3、Part 2 準備/作答計時、錄音回放 | ✅ |
| 共用判分引擎（正規化、字數限制、TFNG 簡寫、多選集合比對） | ✅ 19 項單元測試 |
| 題庫 schema 驗證器 | ✅ 4 份試卷 0 error 0 warning |
| 分數換算表（Listening / Reading Academic / General） | ✅ |
| 部署設定：GitHub Actions、render.yaml、docker-compose | ✅ |
| 環境變數 seed 的管理員帳號腳本 | ✅ 不寫死密碼 |

### 驗證結果

- `npm run typecheck`：三個 workspace 全部通過
- `npm test`：19 / 19 通過
- `npm run validate:content`：4 份試卷，0 error、0 warning
- `npm run smoke:db`：對真實 Postgres 引擎（PGlite）跑 17 條 SQL，全部通過
- API 實測：`/api/health`、`/api/content/manifest`、答案不外洩、DB 未連線時回 503
- `npm run build`（含 `VITE_BASE=/ielts-practice/`）：通過，音檔正確打包

### 與原計劃的差異

1. **套件管理器改用 npm workspaces**：pnpm 12（Rust 版）在這台機器上會 stack overflow。
2. **不用 Drizzle**：直接寫 SQL + `pg`，少一層抽象、部署更輕。
3. **不用 Supabase Auth**：改自建 `users` 表 + JWT，Supabase 只當 Postgres 用（任何 Postgres 都可）。
4. **口說音檔不上傳**：只存 metadata，錄音留在瀏覽器 session（見 README 限制）。

### 尚未完成（建議下一輪）

- Email 驗證與密碼重設（公開註冊前必做）
- 口說音檔上傳到物件儲存 + 逐字稿
- 更多題庫（目前各 1 份）
- 瀏覽器 E2E 測試（Playwright）
- 深色模式、錯題本、單字本
