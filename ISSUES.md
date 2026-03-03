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
  - **File:** `src/app/page.tsx`
  - **Problem:** Dashboard hardcodes `'AUD'` in `formatDashboardCurrency()` despite configurable currency in Settings.
  - **Fix:** Read currency from settings context.
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

- [ ] **FEAT-4: Proper Pagination**
  - Currently hard-limited to ~100 transactions. Add infinite scroll or page navigation controls.

- [ ] **FEAT-5: Multi-Currency Consistency**
  - Read `settings.currency` everywhere instead of hardcoding `'AUD'`. Affects dashboard, reports, and investments.

- [ ] **FEAT-6: PWA / Offline Support**
  - Since it's local-first, add a service worker + manifest for full offline-capable progressive web app.

- [x] **FEAT-7: API Error Middleware**
  - Created `src/lib/apiHandler.ts` and applied it to `src/app/api/accounts/route.ts` (`GET`), `src/app/api/settings/route.ts` (`GET`, `PUT`), `src/app/api/transactions/route.ts` (`GET`, `POST`, `PUT`, `DELETE`), and `src/app/api/budget/route.ts` (`PUT`) to standardize error handling and reduce repeated try-catch boilerplate.

- [x] **FEAT-8: Global "New Transaction" Shortcut**
  - Wired global `N` in `KeyboardShortcutsProvider` to navigate to `/transactions?new=1`, and added handling in transactions page to auto-open the new transaction modal.

- [ ] **FEAT-9: Budget Overspending Toasts**
  - Show a notification/toast when a budget category goes negative after an assignment or transaction.

- [ ] **FEAT-10: CSV Transaction Export**
  - Add CSV export of transactions alongside the existing JSON backup option.
