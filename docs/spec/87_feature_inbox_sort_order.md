# Oksskolten Spec — Inbox Sort Order Toggle

> [Back to Overview](./01_overview.md)

## Overview

記事一覧（Inbox / Feed 個別 / Category 個別）の並び順を `published_at` の降順（新しい順）と昇順（古い順）で切り替え可能にし、選択を端末・ブラウザを越えて永続化する。

## Motivation

現状、記事一覧は `GET /api/articles` が返す固定順（`published_at IS NULL, published_at DESC`）で表示されるため、未読が大量に溜まった状態で「古いものから順に読みたい」や、特定フィードの過去記事を古い順に遡りたいというユースケースが満たせない。

既存の `sort` クエリパラメータは `"score"` のみを受け付けており、公開日時の順序そのものを切り替える仕組みは存在しない。`published_at` 基準で表示している画面（Inbox / Feed 個別 / Category 個別）を対象に小さな切り替え機構を追加し、既存設定（`reading.*`）と同じ二層ストレージ（ADR-001）で永続化することで、他デバイスでも同じ並び順を維持する。

## Scope

### In Scope

- 対象画面: `/inbox`、`/feeds/:feedId`、`/categories/:categoryId`
- 設定 UI: 記事一覧のヘッダ（`article-list.tsx` 上部）にインライン・トグルを表示し、加えて Settings → Reading にラジオグループを置く。どちらも同じ `reading.article_sort` を読み書きするので、一方で切り替えると他方にも即時反映される
- `reading.article_sort` 設定キーを localStorage + DB の二層で永続化。値は `'desc' | 'asc'`、デフォルト `'desc'`。Inbox / Feed / Category で共通の単一設定（どれかで切り替えると他の一覧にも即時反映）
- `GET /api/articles` に新クエリパラメータ `order=asc|desc` を追加（省略時 `desc`）
- i18n ラベル（ja / en）の追加

### Out of Scope

- Bookmarks / Likes / History / Clips：並び順はそれぞれ `bookmarked_at DESC` / `liked_at DESC` / `read_at DESC` の固定のままで、このトグルは表示されない
- 記事詳細ページへの `order` パラメータの伝搬（専用 next/prev ボタンは存在せず、キーボードナビの j/k は `ArticleList` 内の `articleIds` 配列を直接辿るため、一覧の `order` が反映されれば自動的に追従する。オーバーレイ表示も同じ経路）
- Smart Floor の挙動変更以外の改修（Feed/Category で `order=asc` のときのみ Smart Floor を無効化する最小限の分岐を追加する。降順時の挙動は一切変更しない）

## Design

### 並び順仕様

- 値の語彙: `'desc' | 'asc'`（SQL/API と直接一致させる）
- デフォルト: `'desc'`（既存挙動を維持）
- `published_at` が NULL の記事の扱い（両方向とも NULLs last で統一）
  - 降順: `ORDER BY published_at IS NULL, published_at DESC`（現状どおり）
  - 昇順: `ORDER BY published_at IS NULL, published_at ASC`（NULL は末尾に残す）

### API

`GET /api/articles` に新クエリパラメータ `order` を追加する。

| パラメータ | 値 | デフォルト | 説明 |
|---|---|---|---|
| `order` | `"asc"` / `"desc"` | `"desc"` | `published_at` の並び順。`sort=score` が指定されている場合は無視される |

Zod スキーマに `order: z.enum(['asc', 'desc']).optional()` を追加する。未知の値は現状の他クエリ同様 Fastify の Zod エラーとして `400` を返す。

Smart Floor は `order === 'asc'` のとき追加条件で無効化する（`server/routes/articles.ts` の `smartFloor` 計算式に `&& opts.order !== 'asc'` を加える）。昇順では「直近 1 週間」「最新 20 件」「最古の未読まで」の各候補が意味を持たないため。

DB 側 (`server/db/articles.ts` の `getArticles`) の `orderBy` 分岐は以下のとおり拡張する:

```ts
const orderBy = opts.sort === 'score'
  ? 'a.score DESC, a.published_at DESC'
  : opts.liked ? 'a.liked_at DESC'
  : opts.read ? 'a.read_at DESC'
  : opts.order === 'asc'
    ? 'a.published_at IS NULL, a.published_at ASC'
    : 'a.published_at DESC'
```

- `sort === 'score'` が指定されている場合、`order` は無視される（スコア順ビューで昇順は意味を持たないため）
- Bookmarks / Likes / History では `bookmarked_at` / `liked_at` / `read_at` DESC を維持し、`order` を渡しても無視（フロントが渡さない運用で整合させる）

### Frontend 設定機構（ADR-001 準拠）

1. 新規フック `src/hooks/use-article-sort.ts` を `createLocalStorageHook` で実装
   - localStorage キー: `article-sort`
   - 値: `'desc' | 'asc'`、デフォルト `'desc'`
   - エクスポート: `useArticleSort()` が `{ articleSort, setArticleSort }` を返す（`useDateMode` のパターンを踏襲）
2. `src/hooks/use-settings.ts` に以下を追加:
   - `Prefs` に `reading.article_sort: string | null`
   - `hydrationMap` エントリ: `{ key: 'reading.article_sort', setter: setArticleSort, backfillRef: articleSortRef, validate: v => v === 'desc' || v === 'asc' }`
   - `articleSortRef` backfill ref
   - `syncedSetArticleSort: make<'desc' | 'asc'>('reading.article_sort', setArticleSort)`
   - 返却オブジェクトに `articleSort, setArticleSort: syncedSetArticleSort` を追加
3. `server/routes/settings.ts` に以下を追加（`.claude/rules/settings-sync.md` 準拠）:
   - `PREF_KEYS` 配列に `'reading.article_sort'` を追加
   - `PREF_ALLOWED` に `'reading.article_sort': ['desc', 'asc']` を追加

### Frontend UI

記事一覧（`src/components/article/article-list.tsx`）の上部にインライン・トグルを表示する。対象ルート: `/inbox`、`/feeds/:feedId`、`/categories/:categoryId`。Bookmarks / Likes / History / Clips には表示しない（前三者は `bookmarked_at / liked_at / read_at` 固定、Clips は専用フィードで Smart Floor も独自挙動のため本スコープ外）。

- 形状: セグメントコントロール（"Newest" / "Oldest" の 2 ボタン並び、テキストのみ・アイコンなし）
- 配置: Feed 個別ビューでは `FeedMetricsBar` の直下、Inbox / Category ビューではリスト最上部（記事一覧より上、スクロールで流れていく位置）
- モバイル / デスクトップ共通レイアウトで左寄せ
- a11y: `role="group"` + `aria-label={t('articles.sortLabel')}`、各ボタンに `aria-pressed={isSelected}` を付与

加えて Settings → Reading（`src/pages/settings/sections/reading-section.tsx`）に、他の読書設定と同じ `RadioGroup` で「新しい順 / 古い順」を置く。値は一覧ヘッダのトグルと同じ `settings.articleSort` / `setArticleSort` を参照するため、専用の state は持たない。`categoryUnreadOnly` の直後に配置する。

ユーザーが並び順を切り替えると、`getKey()` が返す SWR キーに `order=asc`（非デフォルト時のみ付与）が含まれるため、SWR は自動的に新しいキーでフェッチを開始する。`feedId / categoryId` 変更時と同様に以下もリセットする:

- `autoReadIds`（auto-mark-read の一時バッファ）
- `noFloor`（Smart Floor 解除フラグ）
- `showReadArticles`（カテゴリ既読表示フラグ）
- `focusedItemId`（キーボードナビのフォーカス）
- スクロール位置（ブラウザのデフォルト挙動で新ページとして先頭にリセットされるが、現行 `useEffect([feedId, categoryId, ...])` と同じトリガに `order` を追加する）

### i18n

`src/lib/i18n.ts` に以下のキーを追加する。`articles.*` は一覧ヘッダのトグルと Settings のラジオで共用し、`settings.*` は Settings の見出しと説明文に使う:

| キー | ja | en |
|---|---|---|
| `articles.sortNewest` | 新しい順 | Newest |
| `articles.sortOldest` | 古い順 | Oldest |
| `articles.sortLabel` | 並び順 | Sort |（スクリーンリーダー / ツールチップ用のアクセシブルラベル）
| `settings.articleSort` | 記事の並び順 | Article Sort Order |
| `settings.articleSortDesc` | Inbox・フィード・カテゴリの一覧を公開日時のどちら向きで並べるかを選びます | Choose the publication-date direction for the Inbox, feed, and category lists |

トグル自体はテキストのみで矢印アイコンは付けない。

### Demo Mode

デモモード（`VITE_DEMO_MODE`）でも `order` をサポートする。`src/lib/demo/demo-store.ts` の記事取得関数（`getArticles` 相当）に `order?: 'asc' | 'desc'` を受け取り、配列ソート時に適用する分岐を追加する。実 API と同様、`sort === 'score'` 指定時は `order` を無視する。

### Keyboard Shortcut

並び順切り替えには専用ショートカットを割り当てない。既存の j/k（next/prev）や他のキーバインドと衝突せず、UI 上のトグルボタンのクリック／タップでのみ切り替える。

### Hydration & Initial Render

ADR-001 の二層ストレージに従い、初回描画は localStorage の値でまず行う。DB からの `/api/settings/preferences` 応答が到着したタイミングで `hydrationMap` 経由で `setArticleSort` が呼ばれ、異なる値が DB に保存されていれば記事一覧が新しい SWR キーで再フェッチされる。同一端末では localStorage に同値があるため表示上のチラつきは起こらない。

### Empty / Loading State

記事件数やローディング状態に関わらずトグルは常に表示する（`isLoading` / `isEmpty` の分岐外に置く）。空状態でも並び順の切り替え操作ができる。

### Validation & Backfill Behavior

- localStorage に不正値が入っていた場合、`createLocalStorageHook` の `validValues` で自動的にデフォルト `'desc'` にフォールバックする（他の設定と同じ挙動）
- DB からの hydration 時、`validate` 関数（`v === 'desc' || v === 'asc'`）を通らない値は無視され、localStorage 側の現在値で backfill される
- サーバ側は `PREF_ALLOWED['reading.article_sort'] = ['desc', 'asc']` により不正値を含む PATCH を拒否

### Tests

- `src/hooks/use-article-sort.test.ts` — localStorage の読み書き（`createLocalStorageHook` の既存テストと同じパターン）
- `src/hooks/use-settings.test.ts` — `reading.article_sort` の hydration / backfill / synced setter
- `src/components/article/article-list.test.tsx` — `order=asc` 時に SWR キーへ `order=asc` が付与され、`desc` 時は付与されないこと
- `src/pages/settings/sections/reading-section.test.tsx` — Settings のラジオが現在値を反映し、選択で `setArticleSort` が呼ばれること
- `server/db/articles.test.ts`（または同等の既存テスト）— `getArticles({ order: 'asc' })` で `a.published_at IS NULL, a.published_at ASC` になり、`NULLs last` が保たれること。`sort: 'score'` が指定されたときは `order` が無視されること

### Implementation Status

Implementation complete.

#### Checklist

Backend:
- [x] `server/db/articles.ts` の `getArticles` に `order?: 'asc' | 'desc'` を追加し、`orderBy` 分岐を拡張
- [x] `server/routes/articles.ts` の Zod Query スキーマに `order: z.enum(['asc', 'desc']).optional()` を追加
- [x] `server/routes/articles.ts` の `smartFloor` 判定に `opts.order !== 'asc'` を加える
- [x] `server/routes/articles.ts` から `getArticles` に `order` を渡す
- [x] `server/routes/settings.ts` の `PREF_KEYS` に `'reading.article_sort'` を追加
- [x] `server/routes/settings.ts` の `PREF_ALLOWED` に `'reading.article_sort': ['desc', 'asc']` を追加
- [x] `server/db/articles.test.ts` に `order` 分岐・`sort=score` 優先・NULLs last のテストを追加

Frontend:
- [x] `src/hooks/use-article-sort.ts` を新規作成
- [x] `src/hooks/use-article-sort.test.ts` を新規作成
- [x] `src/hooks/use-settings.ts` の `Prefs`、`hydrationMap`、backfill ref、synced setter、返却値を更新
- [x] `src/hooks/use-settings.test.ts` に hydration / synced setter / backfill のテストを追加
- [x] `src/components/article/article-list.tsx` にトグル UI・`order` 付与ロジック・リセット effect を実装
- [x] `src/components/article/article-list.test.tsx` にトグル表示・非表示・操作のテストを追加
- [x] `src/pages/settings/sections/reading-section.tsx` に Settings → Reading のラジオグループを追加
- [x] `src/pages/settings/sections/reading-section.test.tsx` を新規作成し、現在値の反映と選択時の永続化をテスト

Demo / i18n:
- [x] `src/lib/demo/demo-store.ts` に `order` 分岐を追加（NULLs last 実装）
- [x] `src/lib/demo/mock-api.ts` で `/api/articles` ルートに `order` を受け渡し
- [x] `src/lib/i18n.ts` に `articles.sortLabel` / `articles.sortNewest` / `articles.sortOldest` / `settings.articleSort` / `settings.articleSortDesc` を追加
- [x] `src/lib/demo/i18n.ts` は `demo.*` 専用のため変更不要（`articles.*` は本体 `i18n.ts` を共有）

Docs:
- [x] `docs/spec/01_overview.md` に本仕様書へのリンクを追加
- [x] `docs/spec/20_api.md` の `GET /api/articles` に `order` を追記
- [x] `docs/spec/50_frontend.md` に並び順トグルの仕様を追記
- [x] `make lint-docs` が通ること

Verification:
- [x] `npm run typecheck` が通ること
- [x] `npm run lint` が通ること
- [x] `npm run test` が通ること（2073 件全通過）

#### History

- 2026-04-13: 仕様レビュー完了、実装着手可能
- 2026-04-13: 実装完了。typecheck / lint / test / lint-docs すべて通過。worktree の `node_modules` が空だったため `npm install` を実行し、それに伴って差分が出た `package-lock.json` はリポジトリのルールに従い `git checkout` で元に戻した。
- 2026-07-28: ブランチを当時から 65 コミット進んだ `main` に rebase。`src/lib/i18n.ts` のみコンフリクトし、上流で追加された簡体字中国語（`zh`）に合わせて新規キーへ `zh` 訳を付けて解決した。あわせて Settings → Reading にラジオグループを追加（一覧ヘッダのトグルと同じ `reading.article_sort` を共有）。typecheck / lint / test（129 files, 2116 件）/ lint-docs すべて通過。

### Key Files

| File | Description |
|---|---|
| `server/db/articles.ts` | `getArticles` の `orderBy` に昇順分岐を追加 |
| `server/routes/articles.ts` | Query Zod スキーマおよび `sort`/`order` パラメータの解釈を追加 |
| `server/routes/settings.ts` | `PREF_KEYS` / `PREF_ALLOWED` に新設定キーを追加 |
| `src/hooks/use-article-sort.ts` | 新規フック |
| `src/hooks/use-settings.ts` | hydrationMap / backfill / synced setter を追加 |
| `src/components/article/article-list.tsx` | SWR キーに `order` を反映、トグル UI を実装、リセット effect に `order` を追加 |
| `src/pages/settings/sections/reading-section.tsx` | Settings → Reading に並び順のラジオグループを追加 |
| `src/lib/demo/demo-store.ts` | デモ用記事取得関数に `order` 分岐を追加 |
| `src/lib/i18n.ts` | `articles.sortNewest` / `articles.sortOldest` / `articles.sortLabel` を ja/en で追加 |
| `src/hooks/use-article-sort.test.ts` | 新規単体テスト |
| `src/hooks/use-settings.test.ts` | hydration / backfill / synced setter のテスト追加 |
| `src/components/article/article-list.test.tsx` | SWR キー生成と `order` 付与のテスト追加 |
| `src/pages/settings/sections/reading-section.test.tsx` | 新規テスト。Settings のラジオの表示と永続化 |
| `server/db/articles.test.ts` | `getArticles` の `order` 分岐テスト追加 |
| `docs/spec/01_overview.md` | 本仕様書へのリンク追加（済） |
| `docs/spec/20_api.md` | `GET /api/articles` の `order` パラメータを表に追記 |
| `docs/spec/50_frontend.md` | Inbox / Feed / Category ビューの並び順トグル仕様を追記 |

