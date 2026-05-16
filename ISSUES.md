# Loot Council — Issue Tracker

## Critical Issues

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

- [ ] **PERF-2: No Data Caching (SWR/React Query)**
  - **Files:** `src/app/page.tsx`, most page components
  - **Problem:** Dashboard fires 4+ parallel fetch calls on every mount with no caching. All pages fetch fresh on every visit.
  - **Fix:** Adopt SWR or React Query for automatic caching, revalidation, and deduplication.
  - **Progress:** Added lightweight client cache utility (`src/lib/clientCache.ts`) and applied it to dashboard API reads and transactions filter metadata fetches; broader SWR/React Query migration still pending.
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

- [ ] **FEAT-1: Adopt SWR / React Query**
  - Replace raw `fetch` + `useEffect` with a caching data layer. Eliminates duplicate requests, simplifies loading/error states across all pages.

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
  - **Problem:** Type casts dated from when the Prisma client lacked `ynabId`. Schema and migration now include it, so casts were suppressing real type safety on a mutation-heavy sync path. Also one stale `eslint-disable-next-line` directive.
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

- [ ] **RPT-5: Refactor `src/app/reports/page.tsx` into per-tab files**
  - **Why:** Page is currently 1,400+ lines after additions. The two new tabs (Savings Rate, Top Movers) already live under `src/app/reports/_tabs/` as standalone components — this seeds the per-tab pattern. Remaining 6 tabs (Spending, Income/Expense, Budget vs Actual, Net Worth, By Payee, Category Trends) still inline in the parent.
  - **Plan:** Extract each remaining tab to its own file under `_tabs/`, taking `currency` + `excludeCategoryNames` as props. Each tab manages its own data + UI state (range dropdown, etc.) internally. Parent shrinks to a tab switcher.
  - **Priority:** Low — pure code-organisation, no user-visible change. Tackle in a fresh context window to keep the diff focused.
