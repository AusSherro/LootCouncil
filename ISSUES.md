# Loot Council — Issue Tracker

## Critical Issues

- [x] **CRIT-0: Split Transactions Were Invisible to All Budget Math** ✅ Fixed
  - **Files:** `src/lib/budgetHelpers.ts`, `src/app/api/budget/route.ts`, `src/app/api/budget/forecast/route.ts`, `src/app/api/reports/advanced/route.ts`
  - **Problem:** When a transaction is split, `POST /api/splits` sets the parent's `categoryId` to `null` and stores the money in `SubTransaction` rows. **Every** category-activity aggregation in the app grouped on `transaction.categoryId` only and never read `SubTransaction`. Split spending therefore vanished from category activity, `available`, 6-month spending trends, previous-month activity, the forecast, and three of the six report types. Because account balances *did* drop while envelope `available` did not, the missing money silently leaked out of Ready-to-Assign instead of the envelope it was actually spent from.
  - **Blast radius:** Affected both manually split transactions and YNAB-imported splits (`import/ynab-api/sync/route.ts` creates `SubTransaction` rows too), so any YNAB budget with splits was importing understated spending.
  - **Fix:** Added `getCategoryActivityMap(categoryIds, range)` and `getMonthRange(month)` to `src/lib/budgetHelpers.ts`, which union `Transaction` and `SubTransaction` in two parallel `groupBy` queries. All activity call sites now route through it: budget GET (current month, previous month, tier-3 fallback, ready-to-assign envelope total), the 6-month trend query, `calculateActivity()`, and forecast income auto-detection. `reports/advanced` gained a `fetchCategorisedSpending()` helper used by `category-trends`, `budget-vs-actual`, and `top-movers`.
  - **Double-count guard:** Report queries now filter `isSplit: false` on the parent. Previously the split parent was counted as "Uncategorized" — adding sub-transactions without that filter would have double-counted the same money.
  - **Tests:** `src/lib/splitActivity.integration.test.ts` (6 cases) covers attribution, batched map totals, month boundaries, re-split, and unsplit.
  - **Priority:** Critical — silently wrong envelope balances in a budgeting app

- [x] **CRIT-1: Budget API N+1 Query Problem** ✅ Fixed
  - **File:** `src/app/api/budget/route.ts`
  - **Problem:** `calculateAvailable()` called per-category inside `Promise.all`, each issuing 1-3 DB queries. With 30+ categories = 30-90+ queries per budget page load.
  - **Fix:** Batch-fetch all `MonthlyBudget` records for the month in a single query and compute available in-memory.
  - **Resolution:** Replaced per-category `calculateAvailable()` with 3-tier in-memory lookup: Tier 1 (current month include), Tier 2 (batch prior-month fallback), Tier 3 (batch full-history). Query count reduced from 30-90+ to ~6 fixed.
  - **Priority:** High — biggest performance bottleneck

- [x] **CRIT-2: Undo/Redo — No Response Validation**
  - **File:** `src/lib/useUndo.tsx`
  - **Problem:** `performUndo()`/`performRedo()` fire `fetch()` calls but never check `res.ok`. A failed undo silently moves the action to the redo stack, corrupting state.
  - **Fix:** Check response status and throw/handle errors on failure. Show user feedback on undo failure.
  - **Priority:** High — data integrity risk

- [x] **CRIT-3: Categories/Accounts PATCH — Unsanitized Updates**
  - **Files:** `src/app/api/categories/route.ts`, `src/app/api/accounts/route.ts`
  - **Problem:** Request body `updates` object passed directly to `prisma.update({ data: updates })` without whitelisting fields. Allows arbitrary field modification (e.g., `ynabId`, `groupId`).
  - **Fix:** Whitelist allowed fields: `const { name, isHidden, sortOrder } = updates;`
  - **Priority:** High — security risk

- [x] **CRIT-4: Regex ReDoS in Transaction Rules**
  - **File:** `src/app/api/transactions/route.ts`
  - **Problem:** Constructs `RegExp` from user-provided `matchValue`. Catastrophic backtracking patterns like `(a+)+$` can freeze the server thread.
  - **Fix:** Add regex length/complexity limits or use a safe regex library.
  - **Priority:** High — server stability

- [x] **CRIT-5: ConfirmDialog — Broken Close Button Layout**
  - **File:** `src/components/ConfirmDialog.tsx`
  - **Problem:** Close button uses `absolute` positioning but parent `<div>` lacks `relative`. Button may float incorrectly.
  - **Fix:** Add `relative` class to the parent dialog container.
  - **Priority:** Medium — UI bug

- [x] **CRIT-6: Prisma Migration History Is Behind the Current Schema** ✅ Fixed
  - **Files:** `prisma/migrations/20260726120000_init/migration.sql` (new), `scripts/prepare-test-db.mjs`, `deploy/deploy-to-pi.sh`, `Dockerfile`
  - **What the problem actually was:** The original write-up assumed the deployed database was *behind* the schema and that catching up would drop `UserStats`. Inspecting the live database read-only (`scripts/inspect-db.py`) showed something different:
    - It has **no `_prisma_migrations` table at all** — it was built with `prisma db push` and was never tracked by migrations.
    - `UserStats` **does not exist**, so the scary `DROP TABLE "UserStats"` in the drift script was a no-op.
    - The remaining `DROP TABLE` statements were SQLite's standard data-preserving redefinition pattern (`CREATE new_X` → `INSERT SELECT` → `DROP X` → `RENAME`), not data loss.
    - `prisma migrate diff --from-url <live db> --to-schema-datamodel` returned **an empty migration** — the live database was already 100% in sync with `schema.prisma`.
  - **So the real problem was:** the committed migration history was fiction. It described a 2026-02 schema, had never been applied to any database, and could not produce the current 20-model schema.
  - **Fix:** Squashed the history into a single regenerated init migration built from the current schema (`migrate diff --from-empty`, 425 lines, 20 tables, **zero destructive statements**). Verified twice — `migrations → schema.prisma` and `migrations → live database` both now produce an empty diff, so the live database can be baselined with no SQL executed and no data risk.
  - **Baseline procedure** (documented in `deploy-to-pi.sh`): back up, then `prisma migrate resolve --applied 20260726120000_init`, then `prisma migrate deploy` on every subsequent deploy. The Prisma CLI is now copied into the runtime image so these commands actually work inside the container.
  - **Root cause fix — this is the important part:** migrations were never exercised anywhere, which is *why* they silently rotted. `scripts/prepare-test-db.mjs` now builds the test database with `migrate deploy` instead of `db push`, then asserts the result matches `schema.prisma` and fails with the exact required SQL if not. Verified by injecting a schema change and confirming the build fails. Schema drift is now impossible to merge.
  - **Priority:** High — deployment reliability and data integrity

- [x] **CRIT-7: Raspberry Pi Compose Does Not Run Loot Council** ✅ Fixed
  - **Files:** `deploy/docker-compose.yml`, `deploy/Caddyfile`, `deploy/deploy-to-pi.sh`, `.dockerignore`
  - **Problem:** The deployment script copied the application and ran `docker compose up -d --build`, but the Compose file defined only Caddy and Pi-hole. No service built or started the Loot Council image. Caddy proxied to `172.17.0.1:3000`, which nothing served.
  - **Fix:** Added a `loot-council` service that builds `./loot-council`, mounts a persistent `loot-council-data` volume at `/app/data`, sets `DATABASE_URL=file:/app/data/loot-council.db`, and passes `OPENAI_API_KEY` through from the environment. The port is `expose`d to the Compose network only (never published to the host), so Caddy is the sole entry point. Added a `/api/settings` healthcheck and made Caddy `depends_on` it with `condition: service_healthy`. Caddy now proxies to `loot-council:3000` by service name.
  - **Also fixed:** `.dockerignore` did not exclude `.env` or `data/`, so the OpenAI API key and the live SQLite database were being copied into the Docker build context. Both are now excluded — the app has no `NEXT_PUBLIC_*` variables, so nothing is needed at build time.
  - **Migrations:** Deliberately still manual. `deploy-to-pi.sh` does not run `prisma migrate deploy` because CRIT-6 is unresolved and applying the committed history blindly would drop data.
  - **Priority:** High — the Pi deployment could not launch the application

---

## Security Concerns

- [x] **SEC-1: No API Authentication**
  - **Files:** All `src/app/api/*/route.ts`
  - **Problem:** All API routes are open. If dev server binds to `0.0.0.0`, anyone on the network can read/modify financial data.
  - **Fix:** Bound local servers to loopback by default (`next dev -H 127.0.0.1`, `next start -H 127.0.0.1` in `package.json` scripts).
  - **Priority:** Medium — local-first mitigates this

- [x] **SEC-2: Financial Data Sent to OpenAI Without Consent**
  - **File:** `src/app/assistant/page.tsx`
  - **Problem:** `chatWithAdvisor()` sends net worth, income, expenses, and transactions to OpenAI without explicit user consent prompt.
  - **Fix:** Added consent/disclaimer modal on first AI feature use, persisted to localStorage.
  - **Priority:** Medium

- [x] **SEC-3: OpenAI Key Initialization Guard**
  - **File:** `src/lib/openai.ts`
  - **Problem:** Client created with potentially `undefined` key — no warning until runtime failure.
  - **Fix:** Add guard: `if (!process.env.OPENAI_API_KEY) console.warn('AI features unavailable');`
  - **Priority:** Low

- [x] **SEC-4: Error Details Leaked to Client**
  - **Files:** `src/app/api/budget/route.ts`, `src/app/api/accounts/route.ts`, others
  - **Problem:** Error responses include raw Prisma error messages (`details: errorMessage`).
  - **Fix:** Return generic error messages; log details server-side only.
  - **Priority:** Low — local-first mitigates this

---

## Performance Issues

- [x] **PERF-1: Client-Side Transaction Filtering**
  - **File:** `src/app/transactions/page.tsx`
  - **Problem:** Fetches ~100 records, then applies all filters (date, amount, category, search) client-side.
  - **Fix:** Moved filter/search params into `GET /api/transactions` query params and updated transactions page to fetch filtered records from the API.
  - **Priority:** Medium

- [x] **PERF-2: No Data Caching (SWR/React Query)**
  - **Files:** `src/app/page.tsx`, most page components
  - **Problem:** Dashboard fires 4+ parallel fetch calls on every mount with no caching. All pages fetch fresh on every visit.
  - **Fix:** Adopt SWR or React Query for automatic caching, revalidation, and deduplication.
  - **Resolution:** Adopted SWR (see FEAT-1). Reads are cached stale-while-revalidate and refetched on every mount, so financial totals still refresh on each visit; `src/lib/clientCache.ts` was removed.
  - **Priority:** Medium — improves UX significantly

- [x] **PERF-3: TransactionForm Refetches on Every Open**
  - **File:** `src/components/TransactionForm.tsx`
  - **Problem:** Accounts and categories fetched every time the modal opens. These are slow-changing data.
  - **Fix:** Added local cache behavior in modal state: only fetch accounts/categories when those lists are empty; retry path still forces refetch on errors.
  - **Priority:** Low

- [x] **PERF-4: CSS Ambient Animation Performance**
  - **File:** `src/app/globals.css`
  - **Problem:** `body::before` runs a continuous `30s` animation on a `200% × 200%` pseudo-element — can cause jank on low-end devices.
  - **Fix:** Added `will-change: transform` and `prefers-reduced-motion: reduce` media query to disable animation.
  - **Priority:** Low

- [x] **PERF-5: Budget PUT — Sequential Category×Month Upserts** ✅ Fixed
  - **File:** `src/app/api/budget/route.ts`
  - **Problem:** Recalculation iterates every category × every month with individual upsert calls.
  - **Fix:** Use `prisma.$transaction` with batched operations or raw SQL.
  - **Resolution:** Replaced nested for-loop upserts with flatMap record building, pre-filter existing keys via Set, then single `createMany`. Max 3 queries regardless of category×month count.
  - **Priority:** Medium

---

## Code Quality

- [x] **CQ-1: Hardcoded 'AUD' Currency**
  - **Files:** `src/app/page.tsx`, `src/components/GoalProgress.tsx`, `src/components/InlineEdit.tsx`, `src/components/BudgetTemplatesModal.tsx`, `src/components/SplitTransactionModal.tsx`
  - **Problem:** Dashboard and multiple components hardcode `'AUD'` despite configurable currency in Settings.
  - **Fix:** All components now read currency from `useSettings()` context.
  - **Priority:** Medium

- [x] **CQ-2: `useConfirmDialog` — Component Identity Re-renders**
  - **File:** `src/components/ConfirmDialog.tsx`
  - **Problem:** Dialog returned by `useConfirmDialog` hook is wrapped in `useCallback` with `[state]` dep — every state change creates new component identity, causing unmount/remount flickers.
  - **Fix:** Extract Dialog as a stable component receiving props.
  - **Priority:** Medium

- [x] **CQ-3: Dead Code — `calculateSpendingTrend`**
  - **File:** `src/app/api/budget/route.ts`
  - **Problem:** Standalone `calculateSpendingTrend()` function defined but never called.
  - **Fix:** Remove dead code.
  - **Priority:** Low

- [x] **CQ-3b: Dead Code — `calculateAvailable`**
  - **File:** `src/app/api/budget/route.ts`
  - **Problem:** `calculateAvailable()` marked `@deprecated`, ~40 lines of unused code with unnecessary DB queries.
  - **Fix:** Removed entirely.
  - **Priority:** Low

- [x] **CQ-3c: Dead Code — `useListNavigation`**
  - **File:** `src/lib/useKeyboardShortcuts.tsx`
  - **Problem:** `useListNavigation()` exported but never imported anywhere in the codebase.
  - **Fix:** Removed entirely.
  - **Priority:** Low

- [x] **CQ-4: Mixed Delete Confirmation Patterns**
  - **File:** `src/components/TransactionForm.tsx`
  - **Problem:** `handleDelete` uses native `confirm()` while the app has a polished `ConfirmDialog` component.
  - **Fix:** Replace `confirm()` with `ConfirmDialog` for consistency.
  - **Priority:** Low

- [x] **CQ-5: ErrorBoundary Doesn't Reset on Navigation**
  - **File:** `src/components/ErrorBoundary.tsx`
  - **Problem:** Once an error is caught, navigating to another page still shows the error screen.
  - **Fix:** Add a `key` prop tied to the pathname, or implement `componentDidUpdate` to check for route changes.
  - **Priority:** Medium

- [x] **CQ-6: Sidebar Always Renders on Mobile**
  - **File:** `src/components/Sidebar.tsx`
  - **Problem:** Full sidebar DOM rendered on all screen sizes, hidden via CSS.
  - **Fix:** Added `hidden lg:flex` to sidebar so it's not rendered in DOM on mobile.
  - **Priority:** Low

- [x] **CQ-7: Inconsistent Navigation Items**
  - **Files:** `src/components/Sidebar.tsx`, `src/components/MobileNav.tsx`, `src/lib/navigation.ts`
  - **Problem:** Sidebar shows 7 nav items, MobileNav shows 5. No shared constant.
  - **Fix:** Extracted navigation items to `src/lib/navigation.ts` shared constant. Both components now consume from the same source.
  - **Priority:** Low

- [ ] **CQ-8: No Schema Validation (Zod)**
  - **Files:** All `src/app/api/*/route.ts`
  - **Problem:** API routes validate inputs with ad-hoc `if (!field)` checks.
  - **Fix:** Adopt Zod for declarative request validation across all routes.
  - **Priority:** Medium — prevents invalid data, better error messages

- [x] **CQ-9: Duplicated Helper Functions Across API Routes**
  - **Files:** `budget/route.ts`, `budget/auto-assign/route.ts`, `budget/transfer/route.ts`, `transactions/route.ts`, `rules/route.ts`, `investments/route.ts`, `networth/route.ts`, `budget/page.tsx`
  - **Problem:** 7 sets of identical functions copy-pasted across routes: `getMonthOffset`, `calculateActivity`, `isInflowGroup`, `isHiddenCategoriesGroup`, `getExchangeRate`, `matchesRule/isMatch`.
  - **Fix:** Extracted to shared libs: `src/lib/budgetUtils.ts` (pure, client-safe), `src/lib/budgetHelpers.ts` (server-only w/ DB), `src/lib/exchangeRate.ts`, `src/lib/ruleEngine.ts`. All routes now import from shared source.
  - **Priority:** Medium — reduces maintenance burden, ensures consistent behavior

- [x] **CQ-10: Inconsistent ReDoS Protection**
  - **Files:** `src/app/api/transactions/route.ts`, `src/app/api/rules/route.ts`
  - **Problem:** Both files had regex ReDoS guards but with different detection patterns.
  - **Fix:** Unified into single `matchesRule()` in `src/lib/ruleEngine.ts` with combined detection pattern.
  - **Priority:** Medium — correctness + consistency

- [x] **CQ-11: Duplicate OpenAI Client Instance**
  - **File:** `src/app/api/payees/similar/route.ts`
  - **Problem:** Created its own `new OpenAI()` client instead of using the shared one from `src/lib/openai.ts`.
  - **Fix:** Added `getOpenAIClient()` export to `src/lib/openai.ts`, payees/similar now imports it.
  - **Priority:** Low

- [x] **CQ-12: 39 Debug console.log Statements**
  - **Files:** `binance/route.ts`, `investments/route.ts`, `investments/prices/route.ts`, `import/ynab-api/route.ts`, `import/ynab-api/sync/route.ts`
  - **Problem:** 39 `console.log()` debug statements left in production code. One in `binance/route.ts` logged API key metadata.
  - **Fix:** Removed all 39 statements.
  - **Priority:** Medium — debug noise + security (API key logging)

- [x] **CQ-13: Missing Profile Filtering in API Routes**
  - **Files:** `payees/manage/route.ts`, `transfers/match/route.ts`, `ai/chat/route.ts`, `ai/insights/route.ts`
  - **Problem:** Routes operated on all data regardless of active profile.
  - **Fix:** Added `getProfileId()` and `account: { profileId }` filtering to all affected queries.
  - **Priority:** Medium — data isolation between profiles

---

## Missing Error Handling

- [x] **ERR-1: Dashboard Fetch Failure — Infinite Skeleton**
  - **File:** `src/app/page.tsx`
  - **Problem:** If all API fetches fail, no error state is set — user sees loading skeleton forever.
  - **Fix:** Add error state and show a retry-able error message.
  - **Priority:** Medium

- [x] **ERR-2: SettingsProvider — Silent Update Failures**
  - **File:** `src/components/SettingsProvider.tsx`
  - **Problem:** `updateSettings` errors are logged but never surfaced to the user.
  - **Fix:** Show a toast or inline error when settings fail to save.
  - **Priority:** Low

- [x] **ERR-3: TransactionForm — Silent Fetch Failure**
  - **File:** `src/components/TransactionForm.tsx`
  - **Problem:** If account/category fetch fails, user sees empty dropdowns with no explanation.
  - **Fix:** Show an error message or retry button.
  - **Priority:** Medium

- [x] **ERR-4: Bulk Transaction Ops — Console-Only Errors**
  - **File:** `src/app/transactions/page.tsx`
  - **Problem:** Bulk edit/delete failures only logged to console.
  - **Fix:** Show user-facing error feedback.
  - **Priority:** Medium

- [x] **ERR-5: Budget Quick Actions — No Failure Feedback**
  - **File:** `src/app/budget/page.tsx`
  - **Problem:** Quick actions fail silently with no user feedback.
  - **Fix:** Add toast/notification on action failure.
  - **Priority:** Medium

- [x] **ERR-6: Categories DELETE — No Existence Check**
  - **File:** `src/app/api/categories/route.ts`
  - **Problem:** No existence check before `categoryGroup.delete` — raw Prisma error on missing record.
  - **Fix:** Check existence first; return 404 if not found.
  - **Priority:** Low

---

## Feature Suggestions

- [x] **FEAT-1: Adopt SWR / React Query**
  - Replace raw `fetch` + `useEffect` with a caching data layer. Eliminates duplicate requests, simplifies loading/error states across all pages.
  - **Resolution:** `src/lib/useApi.ts` wraps SWR: `useApi(url)` for GET reads (pass `null` to skip, e.g. while a modal is closed), `useApiQuery([path, ...], fetcher)` for multi-request reads, and `revalidateApi(...paths)` to refresh cached reads after a mutation (no arguments = every API read). `DataProvider` (in the root layout) sets the fetcher and revalidates everything when the active profile changes. Mutations that move money (transactions, splits, transfers, card payments, bulk edits, processing scheduled items) call `revalidateApi()`. With the hand-rolled effects gone, `react-hooks/set-state-in-effect` runs at its default severity again.

- [ ] **FEAT-2: Zod Validation Layer**
  - Shared schema validation for all API inputs. Better error messages, prevents invalid data, reduces boilerplate.

- [x] **FEAT-3: Transaction Search Debouncing**
  - Search input in transactions filters on every keystroke. Added 300ms debounce for smoother UX.

- [x] **FEAT-4: Proper Pagination**
  - Currently hard-limited to ~100 transactions. Added Prev/Next pagination controls below the Transactions list with "Page X of Y" + "N–M of total" indicator. Offset resets to 0 when filters/search change. API `?limit=100&offset=…` was already supported server-side — only the UI was missing.

- [x] **FEAT-5: Multi-Currency Consistency**
  - **Problem:** Many components called `formatCurrency(cents)` without passing the user's home currency, so they always rendered as AUD regardless of the Settings → Currency choice.
  - **Fix:** Introduced a module-level default in `src/lib/utils.ts` (`setDefaultCurrency` / `getDefaultCurrency`). `SettingsProvider` calls `setDefaultCurrency(data.currency)` whenever settings load or change. Every bare `formatCurrency(x)` call now follows the user's setting at render time, with **zero call-site edits** required.
  - **MSFT/USD safe:** per-asset formatters in `investments/page.tsx` (lines 2069, 2075) keep passing `asset.currency` explicitly, so foreign-currency holdings (e.g. MSFT in USD) continue to display in their native currency. The backend `HOME_CURRENCY = 'AUD'` constants remain as the conversion target since the dataset's AUD-converted totals are pre-computed server-side.

- [ ] **FEAT-6: PWA / Offline Support**
  - Since it's local-first, add a service worker + manifest for full offline-capable progressive web app.

- [x] **FEAT-7: API Error Middleware**
  - Created `src/lib/apiHandler.ts` and applied it to `src/app/api/accounts/route.ts` (`GET`), `src/app/api/settings/route.ts` (`GET`, `PUT`), `src/app/api/transactions/route.ts` (`GET`, `POST`, `PUT`, `DELETE`), and `src/app/api/budget/route.ts` (`PUT`) to standardize error handling and reduce repeated try-catch boilerplate.

- [x] **FEAT-8: Global "New Transaction" Shortcut**
  - Wired global `N` in `KeyboardShortcutsProvider` to navigate to `/transactions?new=1`, and added handling in transactions page to auto-open the new transaction modal.

- [x] **FEAT-9: Budget Overspending Toasts**
  - **Scope:** When inline-editing a category assignment in the budget page, if the resulting `available` is negative *and* the previous available was non-negative (i.e. the category just became overspent), show a warning toast: `"<Category> is overspent by $X.XX"`.
  - **File:** `src/app/budget/page.tsx` (`CategoryRow.handleSave`)
  - **Note:** Transaction-driven overspend (creating a transaction that pushes a category negative) is not yet covered — would need the transactions POST to either return the affected `MonthlyBudget.available` or trigger a budget recompute. Tracked as `FEAT-9b`. The `BudgetTransferModal` already warns about overspending inline before the user confirms a transfer, so no toast added there.

- [x] **FEAT-10: CSV Transaction Export**
  - Added a **Download** button next to *Import CSV* on the Transactions page. Exports all transactions matching the current filters/search (RFC 4180 escaping, UTF-8 BOM so Excel detects encoding, paged fetch up to 50 000 rows). Filename `loot-council-transactions-YYYY-MM-DD.csv`. Columns: Date, Account, Payee, Category, Memo, Amount, Cleared.

---

## Lint & Hygiene Pass — 2026-05-15

- [x] **LH-1: React 19 `setState`-in-effect violation (Sidebar)**
  - **File:** `src/components/Sidebar.tsx`
  - **Problem:** Indicator-positioning effect called `setIndicatorY` directly in the effect body, triggering `react-hooks/set-state-in-effect`. Caused cascading renders on every nav change.
  - **Fix:** Rewrote the effect to subscribe via `requestAnimationFrame` + `ResizeObserver`; `setState` now only fires inside callbacks (idiomatic React 19 "subscribe to external system" pattern). Also auto-repositions when the nav is resized.
  - **Priority:** Medium

- [x] **LH-2: React 19 purity violation (Investments tax calculator)**
  - **File:** `src/app/investments/page.tsx`
  - **Problem:** `Date.now()` called inside the `calcs` `useMemo`, triggering `react-hooks/purity`. Memo could produce unstable results.
  - **Fix:** Captured `now` once at mount via `useState(() => Date.now())` and added it to the memo deps. Stable per session, which matches the calculator's intent.
  - **Priority:** Medium

- [x] **LH-3: Stale ref in Toast cleanup**
  - **File:** `src/components/Toast.tsx`
  - **Problem:** `timersRef.current` read inside the unmount cleanup — value could differ from what the effect captured.
  - **Fix:** Copy `timersRef.current` to a local variable inside the effect body.
  - **Priority:** Low

- [x] **LH-4: Dead unused-vars in budget API routes (7 warnings)**
  - **Files:** `src/app/api/budget/auto-assign/route.ts`, `src/app/api/budget/forecast/route.ts`, `src/app/api/budget/route.ts`, `src/app/api/budget/transfer/route.ts`
  - **Problem:** Stale local variables (`currentAssigned`, `forecastStart`, `remaining`, `totalInflow`, `oldAssigned`), an unused `profileId` capture in two POSTs, and an unused `calculateReadyToAssign` import.
  - **Fix:** Removed dead reads and the unused import. `totalInflow` was tracked but never returned — also removed the two write sites.
  - **Priority:** Low

- [x] **LH-5: YNAB sync — 20× `(prisma.X as any)` casts**
  - **File:** `src/app/api/import/ynab-api/sync/route.ts`
  - **Problem:** Type casts dated from when the generated Prisma client lacked `ynabId`. The current schema includes it, so casts were suppressing real type safety on a mutation-heavy sync path. Also one stale `eslint-disable-next-line` directive.
  - **Fix:** Stripped all 20 `(prisma.X as any)` casts plus accompanying `// eslint-disable-next-line @typescript-eslint/no-explicit-any` directives. Also dropped a leftover `: any[]` on `allCategories`. Type-check + lint pass clean.
  - **Priority:** Medium — restored type safety on the import path

- [x] **LH-6: Stray `tmp-*` files at repo root**
  - **Files:** `tmp-verify.mts`, `tmp-verify-result.txt`
  - **Problem:** Leftover debug scaffolding from a previous session, ~16 KB committed at the root.
  - **Fix:** Deleted both.
  - **Priority:** Low

---

## Open Follow-ups Surfaced During the Pass

- [x] **SEC-5: Budget POST + Transfer — no profile-scope verification**
  - **Files:** `src/app/api/budget/route.ts` (POST), `src/app/api/budget/transfer/route.ts` (POST)
  - **Problem:** Both routes accepted a `categoryId` from the request body and operated on it without confirming the category belongs to the active profile. A user with two profiles could assign/transfer money to a category in the other profile by guessing a UUID.
  - **Fix:** Both routes now call `getProfileId(request)` and replace the previous `findUnique({ where: { id } })` with `findFirst({ where: { id, group: { profileId } } })`. Cross-profile IDs return 404 (not 403) to avoid leaking existence. Applied to budget POST and all three transfer cases (cat→RTA, RTA→cat, cat→cat).
  - **Priority:** Medium — data isolation between profiles

- [x] **SEC-6: `xlsx@0.18.5` → `xlsx@0.20.3` + full dependency audit clean-up**
  - **Original problem:** Prototype pollution (GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g60-mjqj). npm registry is stuck at 0.18.5; SheetJS publishes patched builds only via `cdn.sheetjs.com`.
  - **Fix:** Switched `package.json` dependency to `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` (SheetJS's documented install). All `XLSX.read` / `XLSX.utils.sheet_to_json` call sites in `src/app/api/import/ynab/route.ts` remain API-compatible.
  - **Also fixed in the same sweep:**
    - Bumped `next` and `eslint-config-next` from `16.1.6` to `^16.2.6`, clearing 8 high-severity Next.js advisories (HTTP smuggling, middleware/proxy bypass, SSRF via WS upgrades, RSC cache poisoning, image-cache exhaustion, etc.).
    - Added `"overrides": { "postcss": "^8.5.10" }` to force-update Next's bundled postcss past the XSS-via-unescaped-`</style>` advisory.
    - `npm audit fix` cleared picomatch ReDoS + method-injection advisories (transitive).
  - **Result:** `npm audit` reports **0 vulnerabilities** (down from 11). `npm run build` succeeds in 3.1s with no warnings, lint clean.
  - **Priority:** Low (local-first) — done anyway

- [x] **PERF-2b: `Date.now()` inside `superAssetsNeedingUpdate` filter**
  - **File:** `src/app/investments/page.tsx`
  - **Problem:** Same React 19 purity smell as LH-2; impure call inside a render-time `.filter()` callback. ESLint missed it (the rule walks into callbacks differently), but the impurity is real.
  - **Fix:** Added `const [nowMs] = useState(() => Date.now())` near the other state declarations in `InvestmentsPage` and reused it in the filter callback. Stable per session.
  - **Priority:** Low

---

## Carry-over

- [ ] **FEAT-9b: Overspending toast on transaction creation**
  - **Problem:** FEAT-9 covers the budget-assignment path (inline edit on Budget page). When a transaction pushes a category negative, no toast fires.
  - **Fix:** Extend `POST /api/transactions` to compute and return the affected category's post-transaction `available` value when it's now negative, then toast from `TransactionForm.onSuccess`. Needs to apply the same rollover+activity calculation the GET endpoint uses.
  - **Priority:** Low

---

## Quick-Wins Pass — 2026-05-15

- [x] **QW-1: `(prisma.X as any)` casts in remaining YNAB routes**
  - **Files:** `src/app/api/import/ynab-api/route.ts`, `src/app/api/import/ynab/route.ts`
  - **Problem:** LH-5 fixed only the `sync` sub-route; the parent YNAB import routes still had ~23 type casts and stale `// eslint-disable-next-line @typescript-eslint/no-explicit-any` directives.
  - **Fix:** Bulk-stripped all casts, plus replaced the remaining `any` parameter types with a `YNABRow = Record<string, unknown>` helper and tightened the `data.data.budgets.map` callback to a structural type. `YNABTransaction` and `YNABBudget` got an `[key: string]: unknown` index signature so they remain assignable to `YNABRow`. Type-check + lint pass.
  - **Priority:** Medium

- [x] **QW-2: API error-detail leaks in YNAB routes**
  - **Files:** `src/app/api/import/ynab-api/route.ts` (3 sites), `src/app/api/import/ynab-api/sync/route.ts` (1 site)
  - **Problem:** SEC-4 was marked complete but missed four routes still returning raw `error` / `errorMessage` to the client (`details: error`).
  - **Fix:** Removed `details:` from all four responses; the upstream error is now logged server-side via `console.error` (with full context) and the client sees only a generic `{ error: 'YNAB API error' }` / `{ error: 'Delta sync failed' }`.
  - **Priority:** Medium

- [x] **QW-3: Stale placeholder files deleted**
  - Deleted `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, `public/window.svg` (default `create-next-app` placeholders, zero references in the codebase).
  - Deleted `docs/project-scan-report.json` (one-off scan output from 2026-02-12).
  - Deleted `copilot-instructions.md` at root (Claude-Code workflow rules referencing `tasks/lessons.md` etc — never read by GitHub Copilot, which uses `.github/copilot-instructions.md`).
  - **Priority:** Low

- [x] **QW-4: Favicon wired up**
  - **Problem:** `loot-council.ico` was committed at the repo root (gitignored, but always present locally). Next.js never served it; every browser tab showed the default Next.js icon.
  - **Fix:** Moved to `src/app/icon.ico` — Next 13+ App Router auto-detects this convention and emits `<link rel="icon">` automatically. No metadata changes needed.
  - **Priority:** Low

- [x] **QW-5: Native `alert()` / `confirm()` replaced with Toast + ConfirmDialog**
  - **Problem:** 13 `alert()` calls (settings + scheduled-transactions) and 6 `confirm()` calls (settings, investments, transactions, budget templates, transaction rules, scheduled transactions) bypassed the polished UI system. Native dialogs break the dark theme, lose focus context, and are visually jarring.
  - **Fix:** Adopted the previously-dead `useConfirmDialog()` hook and `useToast()` across **all six files**. Every status alert is now a typed toast (`success` / `error` / `info` / `warning`); every confirm is a themed `<ConfirmDialog>` with proper title, message, variant, and confirm button label. Dialog renderer (`<Dialog />`) added once per component near the JSX root.
  - **Files touched:** `src/app/settings/page.tsx`, `src/app/transactions/page.tsx`, `src/app/investments/page.tsx`, `src/components/ScheduledTransactions.tsx`, `src/components/BudgetTemplatesModal.tsx`, `src/components/TransactionRulesSettings.tsx`
  - **Result:** `grep "alert\\(|if \\(!?confirm\\("` returns zero matches across `src/`.
  - **Priority:** Medium

- [x] **QW-6: Drop dead unused exports**
  - **`src/lib/utils.ts`** — Removed `getDefaultCurrency()` (added in FEAT-5, never imported externally).
  - **`src/lib/prisma.ts`** — Initially removed the named `prisma` export then restored it after build surfaced 11 routes still importing `import { prisma }` (default and named both used). Cosmetic cleanup deferred.
  - **Priority:** Low

---

## UX Improvements Pass — 2026-05-15

- [x] **UX-1: Date-range presets on Transactions filter**
  - **File:** `src/app/transactions/page.tsx`
  - **Fix:** Added a "Quick range" row of 6 preset buttons inside the filters panel — *This month / Last month / Last 30 days / Last 90 days / This year / All time*. Each computes the start+end dates locally and sets the filter state. Resets through the existing "Clear All" button.
  - **Priority:** Low — significant ergonomics win

- [x] **UX-2: Persist Transactions filters per profile in localStorage**
  - **File:** `src/app/transactions/page.tsx`
  - **Problem:** Every page reload wiped the filter state — annoying when investigating one account/category over time.
  - **Fix:** Filters and the *hide reconciliation adjustments* toggle now save to `localStorage` under `loot-council-tx-filters-{profileId}`. Loaded on profile change/mount, persisted on every change after hydration. Profile-scoped so households with separate profiles don't bleed filters into each other.
  - **Priority:** Low

- [x] **UX-3: Keyboard shortcuts help modal — already wired** ✓
  - **File:** `src/components/KeyboardShortcutsProvider.tsx`
  - **Status:** Investigated and the `?` keypress already opens a themed help modal listing 3 shortcut groups (Navigation, Actions, List Navigation). My audit was wrong — no work needed.
  - **Priority:** —

- [x] **UX-4: Dashboard delta widgets — net worth vs last month**
  - **Files:** `src/app/page.tsx`, `src/app/api/networth/route.ts` (no changes needed; data already present)
  - **Problem:** Dashboard already had a `netWorthChange` field hardcoded to `0` and an unused percentage badge slot.
  - **Fix:** Switched dashboard fetch from `?months=1` to `?months=2` to receive the prior month-end snapshot. Computes `netWorthChange` (percent, 1-decimal) and `netWorthChangeAmount` (absolute cents). UI renders the percent badge (existing slot) plus a new sub-line showing the absolute delta — `+$2,400 vs last month` — and a hover title that mirrors the same. Uses arrow-up/arrow-down + success/danger colour for direction.
  - **Priority:** Medium — high-visibility dashboard polish

---

## Reports Improvements Pass — 2026-05-16

- [x] **RPT-1: Drill-down from chart segments**
  - **Files:** `src/app/reports/page.tsx`, `src/app/transactions/page.tsx`
  - **What:** Clicking a chart segment now navigates to `/transactions` with the relevant filters pre-applied — categoryId + date range for the spending pie and Budget vs Actual rows, search query + date range for Payee bars, date range only for Income/Expense bars.
  - **Plumbing:** Enriched `SpendingData` with `categoryId` (was previously keyed only by name) and `IncomeExpenseData` with `startDate`/`endDate` ISO strings. Made the Transactions page honour `?accountId`, `?categoryId`, `?startDate`, `?endDate`, `?q` URL params (previously only `?new=1` was respected); when present, filters auto-apply, the filter panel auto-opens, and the URL is cleaned up via `history.replaceState`.
  - **Net Worth and Category Trends** are not drill-down-enabled yet (no obvious transaction-level mapping for line points without a category-id legend join).
  - **Priority:** Medium — most-requested usability win

- [x] **RPT-2: Global "Exclude categories" filter persisted per profile**
  - **Files:** `src/app/reports/page.tsx`, `src/app/api/reports/advanced/route.ts`
  - **What:** Replaced the per-tab "Hide categories" dropdown on Spending Breakdown with a single global control that applies to **every** report tab. Defaults to `['Uncategorized']` (matching the previous Spending behaviour) and persists per profile in `localStorage` under `loot-council-reports-excluded-{profileId}`.
  - **API:** `/api/reports/advanced` now accepts `?excludeCategories=Name1,Name2`. Each report type (income-expense, spending-by-payee, category-trends, budget-vs-actual, top-movers) drops matching transactions before aggregation. Budget-vs-actual also filters the `MonthlyBudget` query so excluded categories never show up in the budget side either.
  - **Picker:** Populated from `/api/categories` (full list, including categories with no spending yet), sorted alphabetically with `Uncategorized` pinned first.
  - **Priority:** Medium

- [x] **RPT-3: Savings Rate over time tab**
  - **Files:** `src/app/reports/_tabs/SavingsRateTab.tsx` (new), `src/app/reports/page.tsx`
  - **What:** New tab. Reuses the income-expense endpoint, computes `(income − expense) / income × 100` per month. Line chart with a 20% target reference line, plus three summary cards: current month, 3-month rolling average, all-time average (income-weighted to avoid low-income months dominating). Detail table at the bottom listing each month's income, expense, savings, and rate.
  - **Colour-coding:** Green ≥ 20% target, amber 0–20%, red below 0%.
  - **Priority:** Medium

- [x] **RPT-4: Top Movers vs Last Month / Last Year tab**
  - **Files:** `src/app/reports/_tabs/TopMoversTab.tsx` (new), `src/app/api/reports/advanced/route.ts` (new `top-movers` report type), `src/app/reports/page.tsx`
  - **What:** New tab that surfaces the categories whose spending changed most between two periods (current month vs last month, or current month vs same month last year). Three summary cards (current total, previous total, change %), then side-by-side cards for top 5 increases and top 5 decreases with old/new amounts. A full sortable table of all significant movers (≥ $5 absolute change) sits below.
  - **Drill-down:** Every mover card and table row is clickable — opens that category's transactions for the relevant month.
  - **Server-side noise filter:** Drops sub-$5 changes so the lists don't fill with rounding-level wiggles.
  - **Priority:** Medium-High — best "actionable insight" addition

- [x] **RPT-5: Refactor `src/app/reports/page.tsx` into per-tab files**
  - **Resolution:** All 8 report tabs now live under `src/app/reports/_tabs/` and manage their own data and UI state. The parent page owns shared tab navigation and category-exclusion state.
  - **Priority:** Low — pure code organisation, no user-visible change

---

## Product Audit — 2026-07-26

Full-product audit. Baseline before the pass: type-check clean, 21 tests passing,
1 lint warning, 3 high-severity dependency advisories.
After the pass: type-check clean, **27 tests passing**, **0 lint problems**,
**0 npm vulnerabilities**, production build green.

### Correctness (money math)

- [x] **CRIT-0: Split transactions invisible to all budget math** — see Critical Issues above. Headline finding of the audit.
- [x] **AUD-1: Re-splitting a transaction permanently double-counted `MonthlyBudget.activity`**
  - **File:** `src/app/api/splits/route.ts` (POST)
  - **Problem:** POST deleted the existing `SubTransaction` rows and then incremented `activity` for the new splits, but never reversed the activity of the rows it deleted. The DELETE handler reversed correctly, so the two paths disagreed. Splitting $100 as 60/40 and then re-splitting as 100/0 left the category at −160 instead of −100, and the drift was permanent.
  - **Fix:** POST now reads the existing splits inside the same `$transaction` and decrements their contribution before deleting them. Covered by the re-split test case.
  - **Priority:** High — silent, permanent financial drift

- [x] **AUD-2: `monthlyBudget.update(...).catch(() => {})` swallowed real errors**
  - **File:** `src/app/api/splits/route.ts` (DELETE)
  - **Problem:** The reversal loop used `.catch(() => {})` to tolerate a missing row, which also silently swallowed genuine write failures inside a `$transaction`.
  - **Fix:** Switched to `updateMany`, which is a natural no-op when the row is absent and needs no catch.
  - **Priority:** Low

### Security

- [x] **AUD-3: `DELETE /api/budget/auto-assign` had no profile scoping**
  - **File:** `src/app/api/budget/auto-assign/route.ts` (DELETE)
  - **Problem:** The undo handler never called `getProfileId()`. It accepted `{ categoryId, amount }` pairs straight from the request body and wrote to `MonthlyBudget` for any category ID in the database. This is the same class as SEC-5, which was fixed for budget POST and transfer but missed here.
  - **Fix:** Now resolves the active profile, rejects the request with 404 unless `ownsAllCategories()` passes, validates that every amount is an integer, and wraps the previously-unguarded write loop in `prisma.$transaction`.
  - **Priority:** Medium — cross-profile write vector plus a partial-failure risk

- [x] **AUD-4: Remaining error-detail leaks (SEC-4 regression)**
  - **Files:** `src/app/api/quote/route.ts` (2), `src/app/api/budget/auto-assign/route.ts` (3), `src/app/api/import/ynab/route.ts` (1), `src/app/api/import/backup/route.ts` (1)
  - **Problem:** Seven handlers still returned `details: String(error)` or interpolated `error.message` into the response body. Every one already logged server-side, so the client copy added no value.
  - **Fix:** Removed all seven. `grep "details: String(error)"` now returns zero matches across `src/`.
  - **Priority:** Medium

- [x] **AUD-5: Secrets and live database in the Docker build context**
  - **File:** `.dockerignore`
  - **Problem:** Neither `.env` (contains `OPENAI_API_KEY`) nor `data/` (the live SQLite financial database) was excluded, so both were shipped to the Docker daemon and baked into the builder layer on every deploy.
  - **Fix:** Added `.env`, `.env.*`, and `data` to `.dockerignore`. Verified safe — the app has no `NEXT_PUBLIC_*` variables, so nothing is required at build time.
  - **Priority:** Medium

- [x] **AUD-6: Dependency advisories cleared to zero**
  - `npm audit fix` cleared the Next.js and postcss advisories.
  - `sharp@0.34.5` (pulled in transitively by Next 16) was still exposed to four libvips CVEs, and npm's suggested "fix" was a downgrade to Next 14. Added an `overrides` entry pinning `sharp` to `^0.35.3` instead — the app imports no `next/image`, so the surface is minimal.
  - Added overrides for `brace-expansion` `^5.0.8` and `minimatch` `^10.2.5` to clear 15 dev-only ReDoS advisories in the ESLint toolchain without a breaking major bump to ESLint 10. Lint verified working afterwards.
  - **Result:** `npm audit` reports **0 vulnerabilities** (production and dev).
  - **Priority:** Medium

### Silent failures

- [x] **AUD-7: Unvalidated `fetch()` responses and an unhandled promise rejection**
  - **Files:** `src/app/fire/page.tsx`, `src/app/investments/page.tsx`, `src/components/ScheduledTransactions.tsx`, `src/components/SplitTransactionModal.tsx`, `src/components/BudgetTemplatesModal.tsx`, `src/components/PayeeManagement.tsx`
  - **Problem:** Nine call sites parsed `res.json()` without checking `res.ok`, so a 4xx/5xx response was written into component state as if it were data. `ScheduledTransactions` and `SplitTransactionModal` also had `.then()` chains with no `.catch()`, producing unhandled rejections on network failure and leaving empty dropdowns with no explanation.
  - **Worst case:** `fire/page.tsx` `handleSave()` had no status check at all — a failed save closed the editor and looked successful.
  - **Fix:** All nine now check `res.ok`, and every chain has a `.catch()`. Failures surface through the existing `useToast()` system (wired into `PayeeManagement` and `InvestmentsPage`, which previously had no toast access) or inline error state. The FIRE page gained a proper error screen with a retry button instead of a permanent spinner.
  - **Priority:** High — data-loss illusions and dead-end UI states

### Tooling

- [x] **AUD-8: CI could not catch type or dependency regressions**
  - **Files:** `.github/workflows/ci.yml`, `package.json`
  - **Problem:** CI ran lint, test, and build. `next build` does not fail on all type errors, and nothing checked dependency advisories.
  - **Fix:** Added a `typecheck` script (`tsc --noEmit`) and wired it into CI between lint and test, plus an `npm audit --omit=dev --audit-level=high` gate after build.
  - **Priority:** Medium

- [x] **AUD-9: Lint warning cleared**
  - `scripts/seed-demo.mjs` — removed the unused `jitter()` helper. Lint is now at zero problems, so the next warning introduced is visible instead of buried.

### Verified clean (no action needed)

Recorded so future passes don't re-investigate:

- **Modal accessibility** — all 13 modal components route through `ModalDialog`, which applies `role="dialog"`, `aria-modal`, focus trap, Escape-to-close, focus restore, and body-scroll locking via `useModalA11y`. A grep for a literal `role="dialog"` is misleading here; it only matches the two files that render it directly.
- **Profile isolation** — swept all 47 API routes. Only the auto-assign DELETE gap (AUD-3) was found; every other route resolves the active profile and scopes entity lookups.
- **Mass assignment** — no `data: <raw body>` patterns; PATCH handlers whitelist fields.
- **Injection** — no `$queryRawUnsafe` / `$executeRawUnsafe`; all user-supplied regex goes through `src/lib/ruleEngine.ts`.
- **Secrets** — `integrations` GET masks stored keys (`'••••' + slice(-4)`); Binance credentials are never returned to the client.
- **Destructive routes** — `reset` and `reset/budget` both scope every delete to the active profile.
- **Input bounds** — `limit`/`offset` are clamped in transactions, transfers, and payees; date parsing is `NaN`-checked.

### Still open

- **CQ-8 / FEAT-2** (Zod validation) — unchanged.
- **PERF-2 / FEAT-1** (SWR or React Query) — unchanged.
- **FEAT-6** (PWA / offline) — unchanged.
- **FEAT-9b** (overspend toast on transaction creation) — unchanged.

---

## Product Audit, Pass 2 — 2026-07-26

Follow-up pass focused on the two risks flagged at the end of pass 1: the migration
history, and the thin test coverage over money paths.

Result: **48 tests passing** (up from 21 before the audit began), type-check clean,
0 lint problems, 0 npm vulnerabilities, production build green.

### Correctness

- [x] **CRIT-6 resolved** — see Critical Issues above. The live database turned out to be
  already in sync; the *migration history* was the fiction. Squashed and baselined, with
  a drift guard added so it cannot recur.

- [x] **AUD-11: CSV import stored dates at LOCAL midnight, shifting them a day**
  - **File:** `src/app/api/import/csv/route.ts` (`parseDate`)
  - **Problem:** The AU and US branches built dates with `new Date(y, m - 1, d)`, which is **local** midnight. Every budget month boundary in the app is UTC (`getMonthRange`, and `date.toISOString().slice(0, 7)` for trends). In Australia/Sydney — the target timezone, and the one set in `deploy/docker-compose.yml` — local midnight on the 1st is `14:00Z on the last day of the previous month`. **Every CSV transaction dated the 1st of a month was budgeted to the previous month.**
  - **Found by:** the new CSV integration test, which asserted the stored day and got the 4th back for a row dated the 5th.
  - **Fix:** Both branches now use `Date.UTC(...)`. The unrecognised-format fallback is normalised to UTC midnight too, so an unknown bank format cannot drift into an adjacent month either.
  - **Regression test:** `csvImport.integration.test.ts` asserts a `01/10/2026` row stores as exactly `2026-10-01T00:00:00.000Z` and buckets to `2026-10`.
  - **Priority:** High — silent month misattribution on the primary bulk-entry path

- [x] **AUD-12: Same local-midnight bug in the YNAB Excel serial date parser**
  - **File:** `src/app/api/import/ynab/route.ts` (`parseExcelDate`)
  - **Problem:** The Excel epoch was anchored with `new Date(1899, 11, 30)` — local midnight — so every date derived from an Excel serial inherited the same one-day backward shift as AUD-11.
  - **Fix:** Anchored on `Date.UTC(1899, 11, 30)`. The string-parsing branches were already UTC-safe (date-only ISO strings parse as UTC per spec).
  - **Priority:** High — same class, affects XLSX imports

### Test coverage

- [x] **AUD-13: Money paths had no test coverage**
  - **Files:** `src/lib/moneyPaths.integration.test.ts` (new, 13 cases), `src/lib/csvImport.integration.test.ts` (new, 8 cases)
  - **Why:** Pass 1's headline bug (CRIT-0) survived several thorough audits precisely because nothing exercised the split → budget path end-to-end. The same blind spot covered every other balance-mutating route.
  - **Transfers:** balance movement on both legs, net-worth neutrality, two linked uncategorised legs, same-account rejection, non-positive/non-numeric amount rejection, cross-profile account rejection, and full reversal on delete.
  - **Reconciliation:** `clearedBalance` tracking on create, toggle off/on, **idempotence of a no-op toggle** (a classic double-count vector), cross-profile rejection, bridging-adjustment creation when the statement disagrees, and no adjustment when it agrees.
  - **CSV import:** preview writes nothing, AU date parsing, balance arithmetic, duplicate suppression on re-import, separate debit/credit columns, the account balance equalling the sum of its transactions, cross-profile rejection, and empty/missing-account rejection.
  - **Priority:** High — these are the routes where a regression silently corrupts money

### Maintainability

- [x] **AUD-10 (from pass 1): reconciliation payee magic string centralised**
  - **Files:** `src/lib/budgetUtils.ts`, `src/app/api/reconcile/route.ts`, `src/app/api/transactions/route.ts`, `src/app/api/reports/advanced/route.ts`, `src/app/reports/_tabs/IncomeExpenseTab.tsx`, `src/app/reports/_tabs/SpendingBreakdownTab.tsx`
  - **Problem:** `'Reconciliation Adjustment'` was written in one place and string-matched in eight others across five files. A rename on the writing side would silently start counting bookkeeping plugs as real spending in every report.
  - **Fix:** Extracted `RECONCILIATION_ADJUSTMENT_PAYEE` into the client-safe `budgetUtils` module; writer and all readers now share it. Tests deliberately keep the literal so a rename still has to be a conscious choice.
  - **Note:** The two split-aware helpers (`getCategoryActivityMap` for budget math, `fetchCategorisedSpending` for report rows) were **left separate on purpose** — they return different shapes for different questions (signed totals vs. individual expense rows with presentation-level exclusions). Merging them would have produced a worse abstraction than the duplication it removed.

### Needs your decision

- [ ] **AUD-14: Orphaned rows with `NULL profileId` in the live database**
  - Read-only inspection found **1 `CategoryGroup`** and **2 `Payee`** rows with `profileId IS NULL`. Because every query scopes by profile, these rows are invisible to the app — they cannot be viewed, edited, or deleted through the UI, but they still occupy the unique-name space (e.g. a payee name that appears "already taken" for no visible reason).
  - **Decision (2026-07-26): leave them.** Almost certainly leftover reconciliation records from the original YNAB import. Harmless where they are.
  - Re-inspect any time with `python scripts/inspect-db.py data/loot-council.db` (opens the database in SQLite read-only mode).

---

## Product Audit, Pass 3 — 2026-07-26

Swept the areas the first two passes had not reached: investments/net-worth math,
and the budget-mutating and scheduling routes.

Result: **63 tests passing**, type-check clean, 0 lint problems, 0 npm vulnerabilities,
production build green.

### Security

- [x] **AUD-15: `POST /api/budget/quick-actions` had no profile scoping**
  - **File:** `src/app/api/budget/quick-actions/route.ts`
  - **Problem:** The route resolved `profileId` but never used it to validate `categoryId`. It read the category and its `MonthlyBudget` by raw ID and then **upserted an assignment** for it. Any category UUID in the database could be read and written, regardless of profile. Third instance of this class after SEC-5 and AUD-3.
  - **Fix:** Validates ownership via `findOwnedCategory()` up front and returns 404 otherwise; the `underfunded` lookup is now a profile-scoped `findFirst`.
  - **Also fixed in the same route:** the `underfunded` action computed activity from `transaction.categoryId` alone, so split spending was invisible (CRIT-0 class) — it now uses `getCategoryActivityMap`. Month boundaries switched from local-midnight `new Date(y, m, 1)` to the shared UTC `getMonthRange`/`getMonthOffset` helpers.
  - **Priority:** Medium — cross-profile read *and* write

### Correctness

- [x] **AUD-16: Split parents could be given a category, double-counting the money**
  - **Files:** `src/app/api/transactions/[id]/route.ts` (PATCH), `src/app/api/transactions/bulk/route.ts` (POST)
  - **Problem:** Neither route checked `isSplit` before setting `categoryId`. A split parent is required to hold `categoryId = null` with its money in `SubTransaction` rows; giving it a category produces a row that is counted **twice** by `getCategoryActivityMap` — once through the parent and once through each split line. Reachable from the transactions list by categorising a split, individually or in a bulk selection.
  - **Fix:** Both routes reject the update with 400. Clearing the category (setting null) is still allowed.
  - **Also hardened:** PATCH accepted `amount` and `date` without validation — `Math.round(undefined * 100)` yields `NaN` and an unparseable date string yields `Invalid Date`, both heading straight for a money column. Both are now rejected with 400, and the existing-transaction lookup moved above the validation so `isSplit` is known.
  - **Priority:** High — double-counted spending

- [x] **AUD-17: Recurring schedules overflowed past month-end and drifted across DST**
  - **Files:** `src/lib/scheduleDates.ts` (new), `src/app/api/scheduled/route.ts`
  - **Problem 1 — month-end overflow:** `next.setMonth(next.getMonth() + 1)` on 31 January produces "31 February", which JavaScript rolls forward to **3 March**. A bill due on the 31st skipped February entirely, then drifted further every month. The existing clamp only ran when an explicit `dayOfMonth` was set, which is the *less* common case.
  - **Problem 2 — DST drift:** all the arithmetic used local-time mutators on dates stored as UTC midnight. Stepping from September to October in Sydney (UTC+10 → +11) yields `2026-10-14T23:00Z` instead of `2026-10-15T00:00Z` — the due date moves back a day, twice a year, every year.
  - **Fix:** Extracted the logic to `src/lib/scheduleDates.ts` as pure, testable code and rewrote it with UTC mutators plus an `addUTCMonths` helper that sets the day to 1 before changing month, then clamps to the target month's length.
  - **Tests:** `scheduleDates.test.ts` — 7 cases covering simple frequencies, month-end clamping, leap years, explicit `dayOfMonth`, year rollover, both Sydney DST transitions, and unknown-frequency fallback.
  - **Priority:** High — silently wrong recurring due dates

- [x] **AUD-18: Applying a budget template corrupted the next month's rollover**
  - **File:** `src/app/api/templates/route.ts`
  - **Problem:** On create it wrote `available: item.amount`, ignoring prior-month rollover and current activity. On update it wrote only `assigned` and left `available` stale — there was even a `// Recalculate available based on previous balance` comment that was never implemented. Because month *M+1* derives its rollover from month *M*'s **stored** `available`, a template application silently poisoned the following month until someone happened to load month *M*'s budget page and trigger the write-back.
  - **Fix:** Both paths now compute `rollover + assigned + activity` using batched helpers, matching the transfer route. Two queries total regardless of template size.
  - **Test:** asserts rollover 2000 + assigned 10000 + activity −5000 = **7000**, where the old code wrote 10000.
  - **Priority:** High — corrupted future-month envelope balances

- [x] **AUD-19: Allocation percentages summed mixed currencies**
  - **File:** `src/app/api/investments/allocations/route.ts`
  - **Problem:** Asset values were summed in their **native** currency with no FX conversion, while `investments/route.ts` correctly converts each asset to AUD before totalling. A USD holding was therefore counted at roughly two-thirds of its real AUD value, understating its weight and skewing every allocation percentage and rebalancing `deltaValue`.
  - **Fix:** Fetches rates once per distinct currency (same pattern as the investments route) and converts each asset before it enters `currentByClass` / `totalValue`.
  - **Priority:** High — wrong rebalancing advice for any non-AUD holding

- [x] **AUD-20: Age of Money inflated when spending outran recorded income**
  - **File:** `src/app/api/age-of-money/route.ts`
  - **Problem:** The FIFO loop only accumulated `totalSpent` for spending it could match against an income bucket. Once the income queue drained, the unmatched remainder was dropped — shrinking the denominator of `totalAge / totalSpent` and reporting an artificially **older**, more flattering figure. Easily reachable for history imported without an opening-balance inflow.
  - **Fix:** Unmatched spending now counts toward `totalSpent` at age zero.
  - **Priority:** Medium — misleading metric

### Atomicity

- [x] **AUD-21: Budget copy was a non-atomic loop**
  - **File:** `src/app/api/budget/copy/route.ts`
  - **Problem:** Copied each category with a separate awaited `upsert` inside a `for` loop. A failure part-way left the target month with some categories copied and others not.
  - **Fix:** Wrapped in a single `prisma.$transaction`.
  - **Priority:** Medium

### Investigated and dismissed

Recorded so these aren't re-raised:

- **`budget/transfer` cases 1 and 2 "need a transaction wrapper"** — false. Each case performs exactly **one** `upsert`; a single Prisma write is already atomic. Case 3 writes two rows and correctly uses `$transaction`.
- **"Split parent deletes don't reverse `MonthlyBudget.activity`"** — technically true, but the fix would be worse than the bug. `SubTransaction` rows are removed by the schema's `ON DELETE CASCADE`, and all displayed activity is recomputed from `Transaction` + `SubTransaction`, so the **budget shown to the user is already correct**. Adding reversal logic to two more delete paths would mean more queries on a hot path purely to maintain a column nothing reads — see the design note below.
- **Net-worth history uses today's prices for past dates** — real, but not a code defect: there is no historical price table in the schema, so the data to do better does not exist. Fixing it properly means recording `(assetId, date, price)` snapshots whenever prices refresh. Logged as a feature decision, not patched.

### Design note — needs your decision

- [ ] **AUD-22: `MonthlyBudget.activity` is a write-only column**
  - Six routes write it (`splits`, `transfer`, `scheduled`, `templates`, `auto-assign`, and both importers). **Zero** display paths read it — `budget/route.ts` recomputes activity from `Transaction` + `SubTransaction` on every request, and the value the budget page shows comes from that computation, not the column. Its only other consumer is backup export/restore round-tripping.
  - That means every write to it is maintenance cost with no payoff, and any drift is invisible until someone starts trusting it.
  - Two coherent options: **drop the column** (schema migration + backup format change), or **start reading it** as a real cache with consistent maintenance on every write path. The current half-maintained state is the actual defect. Left as-is pending your call.



---

## Pass 4 — Full Codebase Audit & Fixes (2026-10-24)

Comprehensive fourth-pass audit across all 45 API routes, Prisma schema constraints, ledger/money-math helpers, backup/export pipelines, and frontend components. All 22 findings below have been fixed and verified with integration tests (`src/lib/pass4AuditFixes.integration.test.ts`).

### Multi-Profile Isolation & Schema Constraints

- [x] **AUD-23: `POST /api/investments` failed with 500 due to missing `profileId`**
  - **File:** `src/app/api/investments/route.ts`
  - **Fix:** Resolved `profileId = await getProfileId(request)` and passed `profileId` into `prisma.asset.create`.

- [x] **AUD-24: `POST /api/investments/allocations` missing `profileId` & global `@unique` on `AllocationTarget.assetClass`**
  - **Files:** `prisma/schema.prisma`, `prisma/migrations/20260726120000_init/migration.sql`, `src/app/api/investments/allocations/route.ts`
  - **Fix:** Replaced global `@unique` on `AllocationTarget.assetClass` with `@@unique([profileId, assetClass])` and scoped allocation target upserts to `profileId` inside a single `prisma.$transaction`.

- [x] **AUD-25: `GET` & `POST /api/budget/auto-assign` leaked and mutated categories across all profiles**
  - **File:** `src/app/api/budget/auto-assign/route.ts`
  - **Fix:** Scoped category queries to `group: { profileId, isHidden: false }` and wrapped assignments in `prisma.$transaction`.

- [x] **AUD-26: `GET` & `POST /api/fire` cross-profile expense leakage and un-whitelisted create payload**
  - **File:** `src/app/api/fire/route.ts`
  - **Fix:** Scoped `calculateAnnualExpenses(profileId)` to `account: { profileId }`, excluded transfers and reconciliation adjustments, and used whitelisted `safeData` on both `create` and `update`.

- [x] **AUD-27: `GET /api/reports/advanced` (`net-worth-trend`) queried oldest transaction globally**
  - **File:** `src/app/api/reports/advanced/route.ts`
  - **Fix:** Scoped `prisma.transaction.findFirst` to `where: { account: { profileId } }`.

- [x] **AUD-28: Global `@unique` on `ynabId` prevented importing the same YNAB budget into a second profile**
  - **Files:** `prisma/schema.prisma`, `prisma/migrations/20260726120000_init/migration.sql`
  - **Fix:** Replaced global `@unique` on `ynabId` with per-profile `@@unique([profileId, ynabId])` on `Account`, `CategoryGroup`, and `Payee`, and `@@index([ynabId])` on `Category` and `Transaction`.

### Money Math, Ledger Integrity & Budget Accuracy

- [x] **AUD-29: `PUT /api/transactions` & `PATCH /api/transactions/[id]` account-move `clearedBalance` drift and split parent corruption**
  - **Files:** `src/app/api/transactions/route.ts`, `src/app/api/transactions/[id]/route.ts`
  - **Fix:** Used `nowCleared` (`cleared ?? existing.cleared`) when crediting the destination account's `clearedBalance` during an account move; blocked setting a single `categoryId` or changing `amount` out of sync with splits on a split parent; migrated `SubTransaction` activity deltas across months when a split transaction's date changes.

- [x] **AUD-30: Deleting one leg of a Transfer corrupted the sibling account balance and left a dangling `Transfer` row**
  - **Files:** `src/app/api/transactions/route.ts`, `src/app/api/transactions/[id]/route.ts`, `src/app/api/transactions/bulk/route.ts`, `src/app/api/transfers/route.ts`
  - **Fix:** Deleting any transfer-linked transaction (single or bulk) now atomically deletes the sibling transfer leg, reverses its account's `balance` and `clearedBalance`, and deletes the `Transfer` record.

- [x] **AUD-31: `POST /api/budget/quick-actions` `underfunded` ignored YNAB goal codes (`TB`/`TBD`/`MF`/`NEED`/`DEBT`) & `average` ignored splits**
  - **File:** `src/app/api/budget/quick-actions/route.ts`
  - **Fix:** Delegated `underfunded` to `calculateGoalUnderFunded` + `getCategoryAvailableMap` (preserving legacy `'target' | 'monthly' | 'spending'` support) and updated `average` to union `Transaction` and `SubTransaction` outflows.

- [x] **AUD-32: `auto-assign` and `calculateReadyToAssign` ignored prior-month rollover and horizon availability**
  - **Files:** `src/lib/budgetHelpers.ts`, `src/app/api/budget/route.ts`, `src/app/api/budget/auto-assign/route.ts`
  - **Fix:** Unified `calculateReadyToAssign` with the horizon-aware `getCategoryAvailableMap` logic in `GET /api/budget`, and updated `auto-assign` to preserve prior rollover and current-month activity when writing `MonthlyBudget` rows.

- [x] **AUD-33: Advanced Reports dropped split transactions and unbudgeted category spending**
  - **File:** `src/app/api/reports/advanced/route.ts`
  - **Fix:** Updated `income-expense` and `spending-by-payee` to include `SubTransaction` rows, and updated `budget-vs-actual` to include categories with actual spending even when no `MonthlyBudget` row exists for the month.

- [x] **AUD-34: `GET /api/fire` valued lot-less assets at $0 and summed foreign-currency assets without FX conversion**
  - **File:** `src/app/api/fire/route.ts`
  - **Fix:** Fell back to `asset.quantity` when `lots.length === 0` and converted foreign-currency asset values to `AUD` via `getExchangeRate`.

- [x] **AUD-35: `POST /api/investments/prices` wrote CoinGecko AUD prices without setting `currency: 'AUD'`**
  - **File:** `src/app/api/investments/prices/route.ts`
  - **Fix:** Set `currency: 'AUD'` when storing CoinGecko AUD prices on crypto assets.

### Data Export, Backup Restore & Importers

- [x] **AUD-36: `GET /api/export` & `POST /api/import/backup` omitted 8 models and crashed on `ExchangeRate` / PK collisions**
  - **Files:** `src/app/api/export/route.ts`, `src/app/api/import/backup/route.ts`
  - **Fix:** Exported and restored all profile-scoped models (`subTransactions`, `assetLots`, `allocationTargets`, `fireSettings`, `scheduledTransactions`, `transactionRules`, `budgetTemplates` with `items`), wrapped backup restore in a single atomic `prisma.$transaction`, remapped entity IDs so restoring into another profile never collides on primary keys, and upserted `ExchangeRate` on `fromCurrency_toCurrency`.

- [x] **AUD-37: `DELETE /api/categories` did not check `SubTransaction` references before deleting**
  - **File:** `src/app/api/categories/route.ts`
  - **Fix:** Checked both `transactions` and `subTransactions` before allowing category or group deletion.

- [x] **AUD-38: `POST /api/import/ynab-api` ignored `tx.subtransactions` on split transactions**
  - **File:** `src/app/api/import/ynab-api/route.ts`
  - **Fix:** Imported `tx.subtransactions` into `SubTransaction` and marked split parent transactions with `isSplit: true, categoryId: null`.

### Frontend & UX Fixes

- [x] **AUD-39: Off-budget (`onBudget: false`) accounts were hidden from `/accounts`**
  - **File:** `src/app/accounts/page.tsx`
  - **Fix:** Added a `"Tracking / Off-Budget Accounts"` section and `"Tracking"` badge on `AccountCard`.

- [x] **AUD-40: `SplitTransactionModal` & `TransactionForm` could not load existing splits or un-split a transaction**
  - **Files:** `src/components/SplitTransactionModal.tsx`, `src/components/TransactionForm.tsx`
  - **Fix:** Loaded existing splits from `GET /api/splits?transactionId=...`, added an `"Unsplit Transaction"` button calling `DELETE /api/splits`, and disabled single-category selection when editing a split transaction.

- [x] **AUD-41: Dashboard `"View All"` scheduled link (`/transactions?tab=scheduled`) ignored `tab` query param**
  - **File:** `src/app/transactions/page.tsx`
  - **Fix:** Parsed `?tab=scheduled` on mount to switch `activeTab` to `'scheduled'`.

- [x] **AUD-42: `TransactionsPage` inline category edit on split rows & URL drill-down vs `localStorage` filter race**
  - **File:** `src/app/transactions/page.tsx`
  - **Fix:** Rendered a `"Split"` badge instead of `InlineCategorySelect` on split rows, checked `res.ok` in `handleInlineCategoryChange`, and prioritized URL drill-down filters cleanly without merging or overwriting saved `localStorage` filters.

- [x] **AUD-43: `useUndo.tsx` sent wrong payload keys and endpoints for budget, category, and transfer undo/redo**
  - **File:** `src/lib/useUndo.tsx`
  - **Fix:** Sent `amount` in dollars to `POST /api/budget`, used `/api/transfers?id=...` for transfer undo, and used `/api/categories?type=category&id=...` for category delete undo/redo.

- [x] **AUD-44: `ProfileProvider.tsx` waited for `/api/profiles` before syncing `loot-council-profile` cookie**
  - **File:** `src/components/ProfileProvider.tsx`
  - **Fix:** Synchronously synced `localStorage.getItem('loot-council-profile')` to `document.cookie` during client initialization so concurrent mount fetches use the active profile immediately.
