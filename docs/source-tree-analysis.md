# Loot Council — Source Tree Analysis

> **Generated:** 2026-02-12 | **Scan Level:** Quick

---

## Repository Root

```
d:\Vibe Coding\Loot Council\
├── .github/
│   └── agents/                    # GitHub Copilot agent configs
├── docs/                          # 📚 Generated project documentation (this folder)
├── loot-council/                  # 🏰 Main application (project root)
│   ├── .agent/                    # AI agent configuration
│   ├── .github/
│   │   └── agents/                # GitHub Copilot agent configs
│   ├── prisma/                    # 🗃️ Database layer
│   │   ├── schema.prisma          # Database schema (17 models)
│   │   ├── loot-council.db        # SQLite database file
│   │   └── migrations/            # Database migrations
│   │       └── 20260202034301_init/  # Initial migration
│   ├── public/                    # Static assets
│   ├── src/                       # 🔥 Application source code
│   │   ├── app/                   # Next.js App Router
│   │   │   ├── layout.tsx         # ⚡ Root layout (providers, sidebar)
│   │   │   ├── page.tsx           # ⚡ Dashboard (home page)
│   │   │   ├── globals.css        # 🎨 Theme variables, animations, base styles
│   │   │   ├── favicon.ico        # App icon
│   │   │   ├── api/               # 🔌 Backend API routes (46 files, 26 domains)
│   │   │   ├── budget/            # Budget page
│   │   │   ├── transactions/      # Transactions page
│   │   │   ├── accounts/          # Accounts page
│   │   │   ├── reports/           # Reports page
│   │   │   ├── investments/       # Investment portfolio page
│   │   │   ├── fire/              # FIRE calculator page
│   │   │   ├── assistant/         # AI assistant page
│   │   │   └── settings/          # Settings page
│   │   ├── components/            # 🧩 Reusable UI components (26 files)
│   │   └── lib/                   # 🔧 Utilities & hooks (5 files)
│   ├── .env                       # Environment variables
│   ├── package.json               # Dependencies & scripts
│   ├── next.config.ts             # Next.js configuration
│   ├── tsconfig.json              # TypeScript configuration
│   ├── eslint.config.mjs          # ESLint configuration
│   ├── postcss.config.mjs         # PostCSS (Tailwind) configuration
│   ├── start-budget.bat           # Windows launch script
│   ├── ai_context.md              # AI developer context file
│   ├── README.md                  # Project README
│   └── ISSUES.md                  # Issue tracker
├── _bmad/                         # BMAD framework files
└── _bmad-output/                  # BMAD workflow outputs
```

---

## Critical Directories

### `src/app/api/` — Backend API (46 route files)

The API layer follows Next.js App Router conventions with `route.ts` files:

```
api/
├── accounts/route.ts              # Account CRUD (GET, POST, PATCH, DELETE)
├── age-of-money/route.ts          # Age of Money calculation
├── ai/                            # AI-powered features
│   ├── categorize/route.ts        # Auto-categorize transactions
│   ├── chat/route.ts              # Financial advisor chat
│   ├── insights/route.ts          # Spending insights
│   └── optimize/route.ts          # Budget optimization suggestions
├── assets/route.ts                # Asset value management
├── binance/route.ts               # Binance wallet sync
├── budget/                        # Budget operations
│   ├── route.ts                   # Budget CRUD (GET month data, PUT assignments)
│   ├── auto-assign/route.ts       # Auto-fund goal categories
│   ├── copy/route.ts              # Copy budget between months
│   └── quick-actions/route.ts     # Quick budget actions
├── categories/route.ts            # Category/group management
├── exchange/route.ts              # Currency exchange rates (1hr cache)
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
├── quote/route.ts                 # Random financial quotes
├── reconcile/route.ts             # Account reconciliation
├── reports/
│   └── advanced/route.ts          # Advanced reporting (5 report types)
├── reset/                         # Data reset
│   ├── route.ts                   # Delete all data
│   └── budget/route.ts            # Reset budget only
├── rules/route.ts                 # Transaction rule CRUD
├── scheduled/route.ts             # Scheduled transaction CRUD
├── settings/route.ts              # App settings CRUD
├── splits/route.ts                # Split transaction management
├── templates/route.ts             # Budget template CRUD
├── transactions/                  # Transaction management
│   ├── route.ts                   # Transaction CRUD (with rule matching)
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
├── reports/page.tsx               # 📊 Reports (5 chart types)
├── investments/page.tsx           # 📈 Investments (portfolio, lots, allocation)
├── fire/page.tsx                  # 🔥 FIRE Calculator (projections, sliders)
├── assistant/page.tsx             # 🤖 AI Assistant (chat interface)
└── settings/page.tsx              # ⚙️ Settings (theme, import/export, rules)
```

### `src/components/` — UI Components (26 files)

```
components/
├── Sidebar.tsx                    # Navigation (desktop sidebar + mobile hamburger)
├── MobileNav.tsx                  # Bottom navigation for mobile
├── TransactionForm.tsx            # Add/edit transaction modal
├── SplitTransactionModal.tsx      # Split transaction editing
├── GoalEditorModal.tsx            # Category goal configuration
├── GoalProgress.tsx               # Goal progress bar display
├── PayeeAutocomplete.tsx          # Payee input with suggestions
├── PayeeManagement.tsx            # Payee CRUD UI
├── QuickTransferModal.tsx         # Quick account-to-account transfers
├── CreditCardPaymentModal.tsx     # Credit card payment workflow
├── AddAssetModal.tsx              # Investment asset management
├── BudgetTemplatesModal.tsx       # Budget template management
├── CSVImportModal.tsx             # CSV file import wizard
├── ReconciliationModeModal.tsx    # Account reconciliation workflow
├── ScheduledTransactions.tsx      # Scheduled transaction list/management
├── TransactionRulesSettings.tsx   # Transaction rule management
├── ConfirmDialog.tsx              # Reusable confirmation dialog
├── InlineEdit.tsx                 # Inline text editing
├── Sparkline.tsx                  # Mini sparkline charts
├── LoadingSkeleton.tsx            # Loading state skeletons
├── Skeleton.tsx                   # Base skeleton component
├── ErrorBoundary.tsx              # Error handling wrapper
├── KeyboardShortcutsProvider.tsx  # Global keyboard shortcut system
├── UndoToast.tsx                  # Undo/redo floating UI
├── SettingsProvider.tsx           # Settings context provider
└── Toast.tsx                      # Toast notification component
```

### `src/lib/` — Utilities (5 files)

```
lib/
├── prisma.ts                      # Prisma client singleton
├── openai.ts                      # OpenAI client configuration
├── utils.ts                       # Helper functions (formatting, etc.)
├── useKeyboardShortcuts.tsx       # Keyboard navigation hook
└── useUndo.tsx                    # Undo/redo state management hook
```

### `prisma/` — Database Layer

```
prisma/
├── schema.prisma                  # 17 database models
├── loot-council.db                # SQLite database file (local data)
└── migrations/
    ├── migration_lock.toml
    └── 20260202034301_init/       # Initial migration (Feb 2, 2026)
```

---

## Entry Points

| Entry Point | File | Purpose |
|-------------|------|---------|
| App Root | `src/app/layout.tsx` | Root layout with providers (Settings, Keyboard, Undo) |
| Dashboard | `src/app/page.tsx` | Home page with financial summary |
| API Gateway | `src/app/api/*/route.ts` | 46 API route handlers |
| Database | `prisma/schema.prisma` | Schema definition (17 models) |
| Config | `next.config.ts` | Next.js + webpack config |
| Styles | `src/app/globals.css` | Theme variables, animations |
| Launch Script | `start-budget.bat` | Windows launch (opens browser + starts server) |
