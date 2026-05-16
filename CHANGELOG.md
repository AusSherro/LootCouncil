# Loot Council — Changelog

All notable changes to this project will be documented in this file.

---

## [0.4.0] — 2026-05-16

### 📊 Reports — Refactor, Drill-Down & Two New Tabs

The reports page is now a thin shell (~212 lines, down from 1,443) that delegates to eight self-contained tab components under `src/app/reports/_tabs/`. Two new tabs join the lineup, and every chart segment is now a drill-down link into Transactions.

- **New: Savings Rate tab** — line chart of monthly `(income − expense) / income × 100` with a 20% target reference line, three summary cards (current, 3-month rolling, all-time income-weighted), and a detailed table. Green ≥ 20% target, amber 0–20%, red below 0%.
- **New: Top Movers tab** — surfaces the categories whose spending changed most between two periods (this month vs last month, or vs same month last year). Three KPI cards (current, previous, change %), side-by-side cards for top-5 increases and top-5 decreases, and a sortable table of all movers ≥ $5. Every row is clickable.
- **Chart drill-down** — click any segment on Spending Breakdown, Budget vs Actual, By Payee, or Income/Expense to navigate to `/transactions` with categoryId / date-range / search query pre-applied. Filter panel auto-opens, URL is cleaned up.
- **Global "Exclude categories" filter** — single control that applies to *every* report tab, persisted per profile in localStorage. Defaults to `['Uncategorized']`. API: `?excludeCategories=Name1,Name2` on `/api/reports/advanced`.
- **Per-tab extraction** — Spending Breakdown, Income vs Expense, Budget vs Actual, Net Worth, By Payee, Category Trends, Savings Rate, Top Movers each live in their own file taking `currency` + `excludeCategoryNames` as props.

### 🧾 Transactions — Pagination, Export, Presets, Persistence

- **Pagination** — Prev/Next controls below the list with "Page X of Y" + "N–M of total" indicator. Offset resets to 0 when filters/search change. Removes the previous hard 100-row ceiling on visibility.
- **CSV export** — Download button next to *Import CSV* exports all transactions matching current filters/search (RFC 4180 escaping, UTF-8 BOM for Excel, paged fetch up to 50 000 rows). Filename `loot-council-transactions-YYYY-MM-DD.csv`.
- **Date-range presets** — six "Quick range" buttons inside the filter panel: *This month / Last month / Last 30 days / Last 90 days / This year / All time*.
- **Filters persisted per profile** — all filters + the "hide reconciliation adjustments" toggle now save to `localStorage` under `loot-council-tx-filters-{profileId}`, scoped so two-person households don't bleed filters across profiles.
- **URL params honoured** — `?accountId`, `?categoryId`, `?startDate`, `?endDate`, `?q` are now applied on load (previously only `?new=1` was respected) — enables the chart drill-down above.

### ✨ Dashboard & UX

- **Net worth delta widget** — dashboard now fetches 2 months of net worth and shows the prior-month percentage badge plus a `+$2,400 vs last month` sub-line with up/down arrow and success/danger colour.
- **Native `alert()` / `confirm()` purged** — adopted the `useConfirmDialog()` and `useToast()` hooks across Settings, Transactions, Investments, ScheduledTransactions, BudgetTemplatesModal, TransactionRulesSettings. 13 alerts and 6 confirms gone; every status message is now a typed themed toast.
- **Multi-currency consistency** — introduced a module-level default in `src/lib/utils.ts`; `SettingsProvider` calls `setDefaultCurrency()` on load. Every bare `formatCurrency(x)` call now follows the user's setting at render time with zero call-site edits. Foreign-currency assets (e.g. MSFT in USD) still display in their native currency.
- **Budget overspending toast** — inline-editing an assignment that pushes a category negative now fires `"<Category> is overspent by $X.XX"`.
- **Favicon wired up** — moved `loot-council.ico` to `src/app/icon.ico` so Next 13+'s App Router auto-emits the `<link rel="icon">` tag.

### 🔒 Security & Dependency Hygiene

- **`npm audit` clean** — was 11 vulnerabilities, now 0.
  - `xlsx` 0.18.5 → 0.20.3 (via `cdn.sheetjs.com`) — clears prototype pollution + ReDoS advisories.
  - `next` + `eslint-config-next` 16.1.6 → 16.2.6 — clears 8 high-severity Next.js advisories (HTTP smuggling, middleware/proxy bypass, SSRF, RSC cache poisoning, image-cache exhaustion).
  - `overrides: { postcss: "^8.5.10" }` — forces past the XSS-via-unescaped-`</style>` advisory in Next's bundled postcss.
- **Profile-scope verification on Budget POST + Transfer** — both routes now confirm `categoryId` belongs to the active profile before mutating. Cross-profile IDs return 404 (not 403) to avoid leaking existence.
- **YNAB error-detail leak fixed** — three `/api/import/ynab-api` routes and one `/sync` route were still returning raw upstream errors to the client. Now logged server-side only.

### 🧹 Code Quality

- **Restored YNAB type safety** — stripped ~43 `(prisma.X as any)` casts across `import/ynab/`, `import/ynab-api/`, and `import/ynab-api/sync/` (no longer needed since the schema includes `ynabId`). Replaced remaining `any` parameter types with a `YNABRow = Record<string, unknown>` helper.
- **39 debug `console.log` statements removed** — including one in `binance/route.ts` that logged API key metadata.
- **React 19 lint fixes** — Sidebar `setState`-in-effect (rewrote with `requestAnimationFrame` + `ResizeObserver`), Investments tax calculator `Date.now()`-in-`useMemo` (captured at mount), Toast stale-ref cleanup.
- **Stale files purged** — 5 default `create-next-app` placeholder SVGs from `public/`, `docs/project-scan-report.json`, root `copilot-instructions.md` (Claude-Code workflow, never read by GitHub Copilot), and two `tmp-*` debug files.

---

## [0.3.9] — 2026-03-18

### 🪥 Polish — Final Quality Pass

Systematic polish pass fixing visual inconsistencies, undefined tokens, missing interaction states, and accessibility gaps across the app.

- **Defined `--color-primary` token** — `text-primary`/`bg-primary` was used 31 times but never registered in the Tailwind `@theme` block; now maps to `--gold` and adapts per theme. Added `--color-primary-foreground` for solid-bg text contrast.
- **Button disabled styling** — added `.btn:disabled` / `.btn[aria-disabled]` styles (opacity 0.5, `cursor: not-allowed`, `pointer-events: none`); ~30 buttons already passed `disabled` props with zero visual feedback
- **Missing aria-labels** — added `aria-label` to 8 icon-only buttons: prev/next month (Budget), select-all checkbox (Transactions), 4 modal close buttons (Investments, Budget)
- **Undefined CSS class cleanup** — replaced `bg-surface-primary`, `bg-surface-secondary/50`, and 4× `bg-surface-light/30` with proper design-system tokens (`bg-background-secondary`, `bg-background-tertiary/30`)
- **Modal animation consistency** — added `animate-fade-in` overlay + `animate-scale-in` panel to 3 investment modals and 1 transaction bulk-edit modal that previously appeared without animation
- **Modal click-to-close** — added overlay `onClick={onClose}` + `stopPropagation` to 3 investment modals that previously trapped the user
- **Missing transition-colors** — added `transition-colors` to 5 hover-enabled elements in Settings and Investments that snapped without easing
- **Finance theme CSS indentation** — fixed inconsistent indentation on `.theme-finance .input:focus` rule
- **Unused imports removed** — cleaned up 5 files: `X` (Accounts), `RefreshCw` (Budget), `GoldCoinSpinner` (Reports), `formatMonthInput` (ForecastModal), `assigned` destructure (GoalProgress)

---

## [0.3.8] — 2026-03-18

### ✨ Delight — Micro-interactions, Polish & Personality

Targeted delight pass adding moments of joy and premium feel without blocking core functionality. All animations respect `prefers-reduced-motion`.

- **Premium shimmer skeletons** — replaced generic `animate-pulse` with a gradient shimmer sweep using theme-aware colors (`background-tertiary` → `border-hover` blend), giving loading states a more polished feel
- **Animated success checkmark** — success toasts now render a hand-drawn SVG checkmark: circle scales in, then the check path draws itself 200ms later via `stroke-dashoffset` animation
- **Goal completion celebration** — when a budget goal hits 100%, the progress bar emits a soft gold glow pulse (`goalComplete` keyframe, 1.2s) and the label swaps to "Goal reached!" with a spring-pop checkmark icon
- **Warm empty states** — replaced flat "No X yet" copy with welcoming, action-oriented text: "Your ledger awaits" (dashboard), "Your transactions live here" (transactions), "Ready to start budgeting" (budget); icons softened to 60% opacity
- **Primary button lift** — `.btn-primary:hover` now rises 1px with a warm gold box-shadow (`0 4px 12px rgba(201,160,78,0.2)`) for a satisfying physical feel
- **Transaction row hover accent** — table rows show a 2px gold inset bar on the left edge on hover via `box-shadow`, with smooth transition alongside the background change
- **Dashboard greeting personality** — time-of-day greetings expanded to 5 periods: "Burning the midnight oil" (<6am), morning, afternoon, evening, "Winding down" (>9pm)
- **Age of Money milestones** — expanded from 2 tiers to 5: "Keep budgeting" → "Getting there, keep going" (14d) → "A month ahead — well done" (30d) → "Two months ahead — great buffer" (60d) → "Three months ahead — rock solid" (90d+)
- **Error state entrance** — dashboard error card now enters with `animate-scale-in` instead of appearing flat

---

## [0.3.7] — 2026-03-18

### 📱 Adapt — Mobile & Responsive Design

Comprehensive responsive adaptation making the two most data-dense pages (Transactions and Budget) fully usable on mobile, with touch enhancements and layout fixes across the app.

- **Transactions mobile card layout** — below `lg:` breakpoint, transactions render as compact card rows (payee + amount on top line, date · category on second line, cleared indicator as avatar) instead of the 7-8 column desktop grid that overflowed on small screens
- **Transactions desktop table preserved** — full grid with all columns (select, date, payee, category, memo, amount, balance, cleared) remains at `lg:` and above
- **Budget responsive grid** — 3-column layout on mobile (`category | assigned | available`) hiding the activity column, drag handle, and row menu; full 6-column layout restored on desktop
- **Budget header restructured** — month navigation moved to top row (always visible on mobile), toolbar buttons wrap naturally with `flex-wrap`
- **Page header stacking** — Transactions header stacks vertically on small screens (`flex-col sm:flex-row`); button labels hide on mobile leaving icon-only buttons
- **Search & filter responsiveness** — filter button text hidden on mobile; filter panel grid adapts from 1-col → 2-col → 4-col (`grid-cols-1 sm:grid-cols-2 md:grid-cols-4`)
- **Bulk action bar** — stacks vertically on mobile with icon-only buttons
- **Bulk edit modal** — slides up from bottom on mobile (`items-end sm:items-center`), full-width on small screens
- **FAB positioning** — floating add button elevated to `bottom-24` on mobile to clear the bottom nav bar, `bottom-6` on desktop
- **Mobile list header** — transactions list shows a select-all button and transaction count on mobile
- **Skeleton dual-mode** — transaction skeleton shows desktop grid or mobile card layout matching the actual rendered view
- **Touch target enforcement** — `@media (pointer: coarse)` sets 44px minimum height on buttons and inputs; inputs sized to `1rem` to prevent iOS zoom on focus
- **Tap feedback** — `@media (hover: none)` adds active-state background on table rows for touch devices
- **Tighter mobile padding** — dashboard, budget, and transactions pages use `p-4` on mobile, `p-8` on desktop
- **Budget summary footer** — responsive grid matching the header, activity column hidden on mobile

---

## [0.3.6] — 2026-03-18

### 🛡️ Harden — Edge Cases, Validation & Accessibility Resilience

Systematic hardening pass strengthening interfaces against edge cases, invalid input, text overflow, and accessibility gaps across the entire app.

- **Toast accessibility** — added `role="status"` and `aria-live="polite"` to toast container so screen readers announce notifications; dismiss button gets `aria-label`; icons marked `aria-hidden`
- **Skip-to-content link** — keyboard users can now skip past the sidebar to main content (`#main-content` anchor in layout)
- **Close button aria-labels** — added `aria-label="Close"` to **11 modal close buttons** (BudgetTransfer, GoalEditor, QuickTransfer, CSVImport, Forecast, KeyboardShortcuts, ScheduledTransactions, BudgetTemplates, SplitTransaction, Reconciliation, CreditCardPayment)
- **TransactionForm input hardening** — amount field gains `min="0"` / `max="999999999"` with `aria-label`; memo gains `maxLength={500}`; client-side validation rejects zero/negative amounts, oversized values, payees >200 chars, memos >500 chars
- **InlineTextEdit hardening** — `maxLength={200}` on input; trims whitespace before save; reverts on empty instead of saving blank
- **Transaction API (POST)** — server-side validation for amount type/range (`isFinite`, ≤999M), payee length (200), memo length (500)
- **Transaction API (GET)** — `limit` clamped to 1–500, `offset` clamped to ≥0 to prevent abuse
- **Accounts API (POST)** — name length capped at 100 chars, type at 50 chars
- **Text overflow protection** — transaction row payee and category columns gain `truncate min-w-0` to prevent layout blow-out with long text; InlineCategorySelect trigger and dropdown items use `truncate` with `flex-shrink-0` on icons
- **AbortController cleanup** — transactions page fetch uses AbortController with cleanup on unmount/re-render, preventing state updates on stale requests

---

## [0.3.5] — 2026-03-18

### ✨ Animate — Motion & Micro-interactions

Strategic animation system adding purposeful motion across the app — entrance choreography, modal transitions, toast feedback, and button micro-interactions.

- **Animation token system** — added `--ease-out-quart` and `--ease-out-expo` CSS custom properties replacing generic `ease` across all transitions
- **10 new keyframes** — `fadeOut`, `scaleIn/Out`, `slideUp/Down`, `slideInFromBottom/OutToBottom`, `overlayFadeIn`, `expandHeight`, `progressFill`
- **12 new utility classes** — `.animate-scale-in/out`, `.animate-slide-up/down`, `.animate-slide-in-bottom/out-bottom`, `.animate-overlay`, `.animate-expand`, `.animate-progress-fill`, `.animate-fade-out`, `.animate-stagger`
- **Modal animations (11 modals)** — all overlays get `animate-fade-in`, all content panels get `animate-scale-in` (subtle 95%→100% scale); fixes previously undefined `.animate-scale-in` in ConfirmDialog
- **Toast slide animations** — toasts now slide in from bottom on appear and slide out on dismiss (was instant remove); exit animation with proper timer cleanup
- **Button press feedback** — `.btn:active` scales to 0.97 for tactile click feel; transitions upgraded to target specific properties instead of `all`
- **Input focus enhancement** — focus ring expanded from 2px to 3px with softer opacity, using quart easing
- **Card hover polish** — hero cards gain subtle gold glow on hover (`box-shadow`); all card/settings-section transitions use proper easing
- **Dashboard entrance choreography** — header gets `animate-slide-up`, stat grids use `animate-stagger` (50ms per child) for sequential reveal
- **Budget page** entrance upgraded from `animate-fade-in` to `animate-slide-up`
- **Sidebar indicator** easing upgraded to `--ease-out-expo` for snappier navigation feel
- **`prefers-reduced-motion` support** — global media query disabling all animations and transitions for accessibility

---

## [0.3.4] — 2026-03-18

### 🔤 Typeset — Typography Refinement

Systematic typography improvements for better readability, consistency, and accessibility across the entire app.

- **Global `tabular-nums`** applied to body — all ~70+ financial displays now align properly in columns (was only on ~14 budget elements)
- **`font-kerning: normal`** enabled on body for proper letter spacing
- **Body `line-height: 1.6`** for improved dark-mode readability (up from Tailwind default 1.5; recommended +0.1 for light-on-dark text)
- **Modal titles standardized** — 4 outlier modals (BudgetTemplates, CreditCardPayment, Reconciliation, SplitTransaction) normalized from `text-xl font-bold` to `text-lg font-semibold`, matching the other 10 modals
- **Hardcoded `px` font sizes replaced with `rem`** for accessibility (respects user zoom):
  - BudgetFlowBar bar labels: `text-[10px]` → `text-[0.625rem]` (3 instances)
  - ForecastModal chart ticks: `fontSize: 11` → `fontSize: '0.6875rem'` (2 instances)
- **New utility classes** added: `.leading-heading` (line-height 1.2 for headings), `.max-w-prose` (max-width 65ch for long-form text)

---

## [0.3.3] — 2026-03-18

### 📐 Arrange — Layout & Spacing Normalization

Systematic layout improvements to establish consistent spacing rhythm, visual hierarchy, and content width constraints across all pages.

- **Global max-width constraint** added via layout wrapper (`max-w-[1400px] mx-auto`) — prevents content from stretching uncomfortably on ultra-wide screens
- **Page padding normalized** to `p-6 lg:p-8` across all 8 pages (accounts, transactions, investments, FIRE, reports, budget, settings already had `p-6` only)
- **Spacing rhythm established** — headers now use `mb-8` for strong separation from content; tab-to-content gaps tightened to `mb-4` (transactions, reports, investments) since tabs belong with their content
- **Dashboard section spacing** improved: stats grid and secondary row both use `mb-8` for breathing room between major content blocks
- **Page header icons standardized** across 6 pages: `w-11 h-11` containers with `bg-gold/12`, `w-6 h-6` icons (was inconsistent mix of w-10/w-11/w-12)
- **Heading weight normalized** to `font-semibold` across all pages (was mixed `font-bold` / `font-semibold`)
- **CSS spacing scale tokens** added to design system: `--space-xs` (4px) through `--space-2xl` (48px)
- **Design context established** — created `.impeccable.md` with brand personality, aesthetic direction, and 5 design principles for future design work

---

## [0.3.2] — 2026-03-18

### 🤫 Quieter — Visual Refinement Pass

Reduced visual intensity across the entire design system for a more refined, sophisticated aesthetic without losing functionality or personality.

- **Color palette desaturated ~15%** across all 7 themes
  - Gold: `#d4a846` → `#c9a04e`, gold-light: `#f0d078` → `#d9b56a`
  - Semantic colors softened: success, danger, warning, info all shifted to less vivid tones
  - Glow opacity halved across all themes (0.4 → 0.2)
  - Badge backgrounds 15% → 10% opacity, borders 30% → 20%
  - Shadow intensity reduced: softer drop shadows and gold glows
- **Font weights lowered throughout**
  - Dashboard stats: `text-3xl font-bold` → `text-2xl font-semibold`
  - Buttons: weight 600 → 500
  - Badges: weight 600 → 500, removed uppercase
  - StatusPill: removed `uppercase tracking-wide`, `font-semibold` → `font-medium`
  - Table headers: weight 600 → 500
  - Sidebar nav: active `font-semibold` → `font-medium`, logo `font-semibold` → `font-medium`
- **Motion reduced**
  - GoldCoinSpinner: 1.2s → 2.4s (half speed), shine opacity 0.2 → 0.1
  - BudgetFlowBar: bar transitions 500ms → 300ms, bar height 20px → 16px, segment opacity lowered
  - AnimatedNumber: default duration 600ms → 400ms
  - Toast: auto-dismiss 4s → 3s
- **Decorative elements simplified**
  - Sidebar logo: solid gold → `bg-primary/15` (translucent)
  - Sidebar active indicator: 3px/32px → 2px/28px, opacity 0.8
  - Budget page icon: 48px → 44px, gold/20 → gold/12
  - Input focus rings: 3px → 2px spread
  - Chart bar hover: removed `brightness(1.1)` filter
  - BudgetFlowBar: removed gold border accent, hero `text-2xl font-bold` → `text-xl font-semibold`
  - Budget table header: removed uppercase

---

## [0.3.1] — 2026-03-18

### 🧹 Distill — Design Simplification

Ruthless complexity reduction across the design system, removing visual noise and dead code while preserving all functionality.

- **globals.css reduced 46%** (1,175 → 631 lines)
  - Removed ambient body glow animation (200% fixed overlay with 3 radial gradients)
  - Removed 9 unused keyframe animations (fadeInUp, shimmer, glow, float, borderGlow, gradientShift, countUp, pulse-gold, slideInRight)
  - Removed 6 unused utility classes (card-glass, card-glow, border-glow, divider-glow, text-gold-gradient, stat-value)
  - Removed unused tooltip CSS, stagger delay classes, animate-shimmer/glow/float/gradient/slide-in/fade-in-up
  - Removed entire unused accent palette (accent-secondary/tertiary/warm/cool across 7 themes)
  - Removed duplicate scrollbar definitions and orphaned theme-specific body::before overrides
  - Simplified `.card` — solid background instead of gradient + backdrop-filter + ::before gold hover line
  - Simplified `.card-hero` — removed gradient, backdrop-filter, ::before line, multi-layer shadows
  - Simplified `.btn-primary` / `.btn-danger` — solid colors instead of gradients + shadows
  - Simplified `.fadeIn` — opacity-only instead of translate+opacity, faster (0.3s)
  - Simplified chart-tooltip, sidebar-active-indicator, settings-section, card-inset
  - Cleaned up all theme-specific overrides (finance, kawaii) to match simplified base
- **Sidebar** — removed gradient shimmer overlay, logo glow shadow, gradient text (now solid `text-gold`)
- **Dashboard** — removed redundant "Quick Access" card (duplicated sidebar navigation)
- **Budget + Transactions** — removed pulsing gold animation from floating action buttons
- **AnimatedNumber** — fixed pre-existing React 19 `useRef` TypeScript error

---

## [0.3.0] — 2026-03-17

### ✨ New Features

- **Budget Forecast ("Can I Afford It?")** — New forecasting modal accessible from the budget page. Projects your cash flow month-by-month using current balances, budget goals, scheduled transactions, and user-provided income. Enter a planned expense (custom or from a category goal), pick when it hits, and get a clear yes/no verdict with a projected balance chart.
  - Area chart visualization (Recharts) showing projected balance over time
  - Month-by-month breakdown table with income/expenses/balance
  - Summary cards: current balance, monthly income, monthly expenses
  - Info tooltips on date fields explaining each input
  - Auto-extends forecast range when expense month exceeds target
  - Supports both custom one-off expenses and category goal-based expenses
  - New API endpoint: `GET /api/budget/forecast`
  - New component: `ForecastModal.tsx`

### 🔧 Improvements

- **Component inventory:** 31 components (up from 26)
- **API routes:** 47 route files (up from 46)

---

## [0.2.0] — 2026-03-04

### ✨ New Features

- **Multi-profile support** — Independent budgets, accounts, and settings per profile
- **Budget transfers** — Move money between envelope categories
- **Budget flow bar** — Visual income → assigned → available breakdown
- **Budget templates** — Save and reuse monthly budget configurations
- **Auto-assign** — One-click goal-based budget funding with undo
- **Quick actions** — Budget last month / average / underfunded / clear
- **Copy last month** — Duplicate previous month's budget assignments
- **Spending trends** — 6-month sparkline per category
- **Goal system** — TB, TBD, MF, NEED, DEBT goal types with progress bars
- **Gold Coin Spinner** — Themed loading indicator
- **Animated Number** — Smooth value transitions for financial displays
- **Chart Tooltip** — Reusable Recharts tooltip with currency formatting
- **Status Pill** — Reusable status badge component
- **Budget helpers/utils** — Server and client budget calculation utilities
- **Exchange rate module** — Centralized currency conversion
- **Rule engine** — Extracted transaction auto-categorization logic

### 🐛 Bug Fixes

- CRIT-1: Budget API N+1 query problem (30-90+ queries → ~6 fixed)
- CRIT-2: Undo/redo response validation
- CRIT-3: Unsanitized PATCH updates (field whitelisting)
- CRIT-4: Regex ReDoS in transaction rules
- CRIT-5: ConfirmDialog broken close button layout
- SEC-1: API bound to loopback by default
- SEC-2: AI data consent modal

---

## [0.1.0] — 2026-02-02

### 🎉 Initial Release

- Zero-based envelope budgeting with YNAB-style methodology
- Account management (checking, savings, credit, investment)
- Full transaction CRUD with splits, transfers, reconciliation
- Investment portfolio tracking (stocks, ETFs, crypto, property, super)
- FIRE calculator with Coast/Barista modes
- Reports: spending breakdown, income vs expense, net worth, payee analysis
- AI-powered financial advisor (OpenAI)
- YNAB import (ZIP + API with delta sync)
- CSV transaction import
- Full JSON backup & restore
- Scheduled recurring transactions
- Transaction auto-categorization rules
- Keyboard shortcuts
- 6 visual themes (Dungeon, Forest, Ocean, Crimson, Royal, Finance)
- Australian locale focus (AUD, super, CGT)
