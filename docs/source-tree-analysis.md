# Loot Council — Source Tree Analysis

> **Generated:** 2026-03-04 (last verified 2026-11-04) | **Scan Level:** Comprehensive

---

## Repository Root

```
loot-council/
├── .github/workflows/ci.yml       # Lint, typecheck, test, build, and dependency audit
├── data/                          # Local SQLite databases (gitignored)
├── deploy/                        # Former Raspberry Pi/Caddy/Compose setup (not used to run the app)
├── docs/                          # Project documentation
├── prisma/                        # Schema (20 models) and migrations
├── scripts/
│   ├── prepare-test-db.mjs        # Rebuilds the Vitest database from migrations, checks for drift
│   ├── seed-demo.mjs              # Fills a separate demo database (README screenshots)
│   └── inspect-db.py              # Read-only database inspection
├── src/
│   ├── app/                       # Next.js App Router pages and 47 API routes
│   ├── components/                # 31 reusable UI components
│   └── lib/                       # 29 utilities, hooks, and test files
├── Dockerfile                     # Standalone image (not used to run the app today)
├── next.config.ts                 # Standalone output, Turbopack, package-import optimisation
├── package.json                   # Scripts and dependencies
├── start-budget.bat               # Windows launcher: opens the browser and runs npm run dev
├── vitest.config.ts               # Unit/integration test configuration
├── ai_context.md                  # AI developer context
├── CHANGELOG.md                   # Release notes
├── README.md                      # Project README
└── ISSUES.md                      # Issue tracker
```

---

## Critical Directories

### `src/app/api/` — Backend API (47 route files, 26 top-level domains)

The API layer follows Next.js App Router conventions with `route.ts` files:

```
api/
├── accounts/route.ts              # Account CRUD (GET, POST, PATCH, DELETE)
├── age-of-money/route.ts          # Age of Money calculation
├── ai/                            # AI-powered features
│   ├── chat/route.ts              # Financial advisor chat
│   ├── insights/route.ts          # Spending insights
│   └── optimize/route.ts          # Budget optimization suggestions
├── assets/route.ts                # Asset value management
├── binance/route.ts               # Binance wallet sync
├── budget/                        # Budget operations
│   ├── route.ts                   # GET month data, POST assign, PUT recalculate activity/available
│   ├── auto-assign/route.ts       # Auto-fund goal categories
│   ├── copy/route.ts              # Copy budget between months
│   ├── forecast/route.ts          # Budget forecast projections ("Can I afford it?")
│   ├── quick-actions/route.ts     # Quick budget actions
│   └── transfer/route.ts          # Transfer funds between categories
├── categories/route.ts            # Category/group management
├── export/route.ts                # JSON data backup export
├── fire/route.ts                  # FIRE calculator settings
├── import/                        # Data import
│   ├── backup/route.ts            # Restore from JSON backup
│   ├── csv/route.ts               # CSV transaction import
│   ├── ynab/route.ts              # YNAB ZIP file import
│   └── ynab-api/                  # YNAB API import
│       ├── route.ts               # Initial YNAB API import
│       └── sync/route.ts          # YNAB delta sync
├── integrations/route.ts          # API key management
├── investments/                   # Investment portfolio
│   ├── route.ts                   # Holdings CRUD with AUD conversion
│   ├── [id]/route.ts              # Individual asset operations
│   ├── allocations/route.ts       # Target vs current allocation
│   ├── lots/route.ts              # Purchase lot management (CGT)
│   └── prices/route.ts            # Symbol lookup, price fetching
├── networth/route.ts              # Net worth history
├── payees/                        # Payee management
│   ├── route.ts                   # Payee list
│   ├── manage/route.ts            # Merge, rename, delete
│   └── similar/route.ts           # Find similar payees
├── profiles/route.ts              # Profile CRUD (multi-profile)
├── quote/route.ts                 # Live stock/crypto quotes (Yahoo Finance)
├── reconcile/route.ts             # Account reconciliation
├── reports/
│   └── advanced/route.ts          # Advanced reporting datasets
├── reset/                         # Data reset
│   ├── route.ts                   # Delete all data
│   └── budget/route.ts            # Reset budget only
├── rules/route.ts                 # Transaction rule CRUD
├── scheduled/route.ts             # Scheduled transaction CRUD + PUT to process due schedules
├── settings/route.ts              # App settings CRUD
├── splits/route.ts                # Split transaction management
├── templates/route.ts             # Budget template CRUD
├── transactions/                  # Transaction management
│   ├── route.ts                   # Transaction CRUD (rule matching via findMatchingRule, server-side filtering)
│   ├── [id]/route.ts              # Individual transaction operations
│   └── bulk/route.ts              # Bulk edit/delete
└── transfers/                     # Transfer management
    ├── route.ts                   # Transfer CRUD
    └── match/route.ts             # Transfer matching
```

### `src/app/` — Page Routes (9 pages)

```
app/
├── page.tsx                       # 🏠 Dashboard (summary cards, quick stats)
├── budget/page.tsx                # 💰 Budget (envelope view, category management)
├── transactions/page.tsx          # 📝 Transactions (list, filter, bulk ops)
├── accounts/page.tsx              # 🏦 Accounts (balances, reconciliation)
├── reports/page.tsx               # 📊 Reports (8 tabs with drill-down)
├── reports/_tabs/                 #    One file per report tab (8 files)
├── investments/page.tsx           # 📈 Investments (portfolio, lots, allocation)
├── fire/page.tsx                  # 🔥 FIRE Calculator (projections, sliders)
├── assistant/page.tsx             # 🤖 AI Assistant (chat interface)
└── settings/page.tsx              # ⚙️ Settings (theme, import/export, rules)
```

### `src/components/` — UI Components (31 files)

```
components/
├── AnimatedNumber.tsx             # Smooth numeric transitions
├── ChartTooltip.tsx               # Shared Recharts tooltip
├── ForecastModal.tsx              # Budget affordability forecast
├── GoldCoinSpinner.tsx            # Themed loading spinner
├── ModalDialog.tsx                # Shared accessible dialog shell
├── Sidebar.tsx                    # Navigation (desktop sidebar, shared nav items)
├── MobileNav.tsx                  # Bottom navigation for mobile
├── TransactionForm.tsx            # Add/edit transaction modal
├── SplitTransactionModal.tsx      # Split transaction editing
├── GoalEditorModal.tsx            # Category goal configuration
├── GoalProgress.tsx               # Goal progress bar display
├── PayeeAutocomplete.tsx          # Payee input with suggestions
├── PayeeManagement.tsx            # Payee CRUD UI
├── QuickTransferModal.tsx         # Quick account-to-account transfers
├── CreditCardPaymentModal.tsx     # Credit card payment workflow
├── BudgetTemplatesModal.tsx       # Budget template management
├── BudgetTransferModal.tsx        # Transfer funds between budget categories
├── BudgetFlowBar.tsx              # Budget flow visualization (income/assigned/available)
├── CSVImportModal.tsx             # CSV file import wizard
├── ReconciliationModeModal.tsx    # Account reconciliation workflow
├── ScheduledTransactions.tsx      # Scheduled transaction list/management
├── TransactionRulesSettings.tsx   # Transaction rule management
├── ConfirmDialog.tsx              # Reusable confirmation dialog
├── InlineEdit.tsx                 # InlineCategorySelect (inline category picker)
├── Skeleton.tsx                   # Loading skeleton component
├── ErrorBoundary.tsx              # AutoResetErrorBoundary (resets on navigation)
├── KeyboardShortcutsProvider.tsx  # Global keyboard shortcut system
├── ProfileProvider.tsx            # Multi-profile context provider
├── UndoToast.tsx                  # Undo/redo floating UI
├── SettingsProvider.tsx           # Settings context provider
└── Toast.tsx                      # Toast notification component
```

### `src/lib/` — Utilities, Hooks, and Tests (32 files)

```
lib/
├── apiHandler.ts                  # withErrorHandler API wrapper
├── budgetHelpers.ts               # Server-side budget math (Ready to Assign, activity/available maps, goal funding)
├── budgetUtils.ts                 # Pure budget helpers (month offsets, group classification)
├── exchangeRate.ts                # Exchange-rate retrieval with 1-hour DB cache
├── navigation.ts                  # Shared navigation items for Sidebar/MobileNav
├── openai.ts                      # OpenAI client, OPENAI_MODEL, chat/insights/optimize helpers
├── prisma.ts                      # Prisma client singleton (default export)
├── profile.ts                     # getProfileId() (query param → cookie → oldest profile)
├── profileOwnership.ts            # Profile-scoped entity lookup helpers
├── ruleEngine.ts                  # matchesRule() + findMatchingRule() with ReDoS guards
├── scheduleDates.ts               # calculateNextDueDate() for recurring schedules (UTC-safe)
├── transactionFormPreferences.ts  # Last-used transaction account per profile
├── useApi.ts                      # SWR data layer: useApi, useApiQuery, revalidateApi
├── useKeyboardShortcuts.tsx       # Keyboard shortcut hook
├── useModalA11y.ts                # Dialog focus, Escape, and scroll behavior
├── useUndo.tsx                    # Undo/redo provider and hooks
├── utils.ts                       # formatCurrency, setDefaultCurrency, toLocalDateString, toLocalMonthString
├── validation.ts                  # Zod schemas + parseBody/parseFormBody for API routes
├── budgetUtils.test.ts            # Unit tests
├── ruleEngine.test.ts             # Unit tests
├── scheduleDates.test.ts          # Unit tests
├── transactionFormPreferences.test.ts # Unit tests
├── useApi.test.ts                 # Unit tests
├── utils.test.ts                  # Unit tests
├── validation.test.ts             # Unit tests
├── budgetInvariants.integration.test.ts  # SQLite integration tests
├── csvImport.integration.test.ts
├── investments.integration.test.ts
├── moneyPaths.integration.test.ts
├── pass4AuditFixes.integration.test.ts
├── profileIsolation.integration.test.ts
└── splitActivity.integration.test.ts
```

### `prisma/` — Database Layer

```
prisma/
├── schema.prisma                  # 20 database models
└── migrations/
    ├── migration_lock.toml
    └── 20260726120000_init/       # Squashed baseline migration (Jul 26, 2026)
```

---

## Entry Points

| Entry Point | File | Purpose |
|-------------|------|---------|
| App Root | `src/app/layout.tsx` | Root layout with providers (Toast, Profile, Settings, Undo, Keyboard) |
| Dashboard | `src/app/page.tsx` | Home page with financial summary |
| API Gateway | `src/app/api/*/route.ts` | 47 API route files |
| Database | `prisma/schema.prisma` | Schema definition (20 models); data stored under `data/` |
| Config | `next.config.ts` | Next.js config (standalone output, Turbopack) |
| Styles | `src/app/globals.css` | Theme variables, animations |
| Launch Script | `start-budget.bat` | Windows launch (opens browser + runs `npm run dev`) |
