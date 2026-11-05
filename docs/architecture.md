# Loot Council — Architecture Document

> **Generated:** 2026-03-04 (last verified 2026-11-04) | **Scan Level:** Comprehensive

---

## 1. Executive Summary

Loot Council is a **local-first personal finance application** built as a monolithic Next.js 16 application. It uses the App Router with client-rendered pages and API routes that access a local SQLite database via Prisma ORM. The architecture prioritizes privacy (no cloud), simplicity (single process), and feature richness (budgeting, investments, FIRE planning, AI advisor). A multi-profile system scopes all data per profile, allowing independent budgets on a single installation. It runs only on the user's own Windows PC, launched with `start-budget.bat`.

---

## 2. Architecture Pattern

**Monolithic Client-Server in a Single Process**

```
┌─────────────────────────────────────────────────────┐
│                   Next.js 16 Process                 │
│                                                      │
│  ┌──────────────┐         ┌───────────────────────┐  │
│  │   Browser     │  HTTP   │   API Routes          │  │
│  │              │◀───────▶│  (src/app/api/*)       │  │
│  │  React Pages  │  JSON   │                       │  │
│  │  (CSR)        │         │  ┌─────────────────┐  │  │
│  │              │         │  │   Prisma ORM     │  │  │
│  └──────────────┘         │  │                  │  │  │
│                           │  │  ┌────────────┐  │  │  │
│                           │  │  │  SQLite DB  │  │  │  │
│                           │  │  │  (file)     │  │  │  │
│                           │  │  └────────────┘  │  │  │
│                           │  └─────────────────┘  │  │
│                           └───────────────────────┘  │
└─────────────────────────────────────────────────────┘
         │                           │
    External APIs              Local File System
    (optional)                 (loot-council.db)
    ├── OpenAI
    ├── Yahoo Finance
    ├── CoinGecko
    ├── Binance
    └── exchangerate-api
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Rendering Strategy | Client-side rendering (CSR) | All pages use `'use client'`; reads go through SWR via `useApi` (`src/lib/useApi.ts`) |
| Data Layer | Local SQLite via Prisma | Privacy-first, no cloud dependency, zero infrastructure |
| API Style | REST-like Next.js API routes | Simple, co-located with frontend, no separate backend |
| State Management | SWR cache + React `useState` | Server data cached per URL by SWR; UI state is page-level; no Redux/Zustand |
| Caching | Selective client cache | Dashboard reads revalidate on each mount; slow-changing transaction form metadata uses an in-memory TTL cache |
| Authentication | None | Local-first design; single user per installation |
| Multi-Profile | Cookie/query param scoping | `Profile` model; `profileId` FK or an owned parent on all data models |
| Styling | Tailwind CSS + CSS variables | Theme system via CSS custom properties |
| AI Integration | Optional OpenAI API | Gracefully degrades without API key; model set by `OPENAI_MODEL` (default `gpt-4o-mini`); data consent required |
| Error Handling | Centralized `withErrorHandler` | `src/lib/apiHandler.ts` wrapper for API routes |

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Runtime** | Node.js | 20.9+ | Server runtime |
| **Framework** | Next.js (App Router) | 16.2 | Full-stack React framework |
| **Language** | TypeScript | 5.x | Type-safe development |
| **Database** | SQLite | — | Local file-based database |
| **ORM** | Prisma | 7.10 | Database access & migrations |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS |
| **Charts** | Recharts | 3.7.0 | Data visualizations |
| **Icons** | Lucide React | 0.563.0 | Icon library |
| **AI** | OpenAI SDK | 6.17 | Chat, insights, budget optimization |
| **Finance Data** | yahoo-finance2 | 3.13.0 | Stock/ETF pricing |
| **Spreadsheet** | xlsx + jszip | 0.20.3 | YNAB import parsing |
| **Testing** | Vitest | 4.x | Unit and SQLite integration tests |
| **Drag & Drop** | dnd-kit | 6.3.1 | Sortable UI elements |
| **Build** | Turbopack | Built-in | Fast dev builds |
| **Linting** | ESLint | 9.x | Code quality |

---

## 4. Data Architecture

### Storage Strategy
- **Primary Store:** SQLite file (`data/loot-council.db`)
- **Schema Management:** Prisma Migrate (1 squashed baseline migration, `20260726120000_init`); the test setup fails on schema drift
- **Monetary Values:** All stored as integers in cents to avoid floating-point errors
- **IDs:** CUID strings (Prisma default)
- **Dates:** Stored at UTC midnight; budget months use UTC boundaries; UI "today" uses local-date helpers in `src/lib/utils.ts`

### Data Flow

```
User Action → React State → useApi / fetch() → API Route (Zod parse) → Prisma → SQLite
                                          ↓
                                   (Optional)
                              External API calls
                          (OpenAI, Yahoo, CoinGecko)
```

### Model Count: 20 models across 8 domains

1. **Profiles** (1): Profile
2. **Core Budgeting** (4): Account, CategoryGroup, Category, MonthlyBudget
3. **Transactions** (4): Transaction, SubTransaction, Payee, Transfer
4. **Automation** (3): TransactionRule, ScheduledTransaction, BudgetTemplate + BudgetTemplateItem
5. **Investments** (3): Asset, AssetLot, AllocationTarget
6. **FIRE** (1): FireSettings
7. **Configuration** (2): Settings, ApiIntegration
8. **Currency** (1): ExchangeRate

See [Data Models](./data-models.md) for complete schema documentation.

---

## 5. API Architecture

### Design
- **47 API route files** across **26 top-level domains**
- Standard REST patterns (GET/POST/PUT/PATCH/DELETE)
- Error handling via the `withErrorHandler` wrapper (`src/lib/apiHandler.ts`) or equivalent per-route `try/catch`; clients receive generic messages
- No authentication layer (loopback-only server)
- Route-specific validation and mutation-field whitelists; no declarative validation framework
- Profile-scoped queries via `getProfileId()` helper (`src/lib/profile.ts`) and ownership checks in `src/lib/profileOwnership.ts`
- Shared domain logic in `src/lib/`: budget math (`budgetHelpers.ts`, `budgetUtils.ts`), rule matching (`ruleEngine.ts`), schedule dates (`scheduleDates.ts`), exchange rates (`exchangeRate.ts`)

### External Integrations

| Service | Purpose | Auth | Caching |
|---------|---------|------|---------|
| OpenAI | AI chat, insights, optimization | API key in env | None |
| Yahoo Finance | Stock/ETF symbol lookup & pricing | None (free API) | None |
| exchangerate-api | Currency conversion | None (free API) | `ExchangeRate` table, 1-hour TTL |
| CoinGecko | Crypto pricing & symbol lookup | None (free API) | None |
| Binance | Crypto wallet sync | API key/secret in DB (`ApiIntegration`) | None |
| YNAB API | Budget import & delta sync | Bearer token (user-provided) | server_knowledge cursor |

See [API Contracts](./api-contracts.md) for complete endpoint documentation.

---

## 6. Frontend Architecture

### Page Structure (9 pages)

| Page | Route | Key Features |
|------|-------|--------------|
| Dashboard | `/` | Summary cards, quick stats |
| Budget | `/budget` | Envelope view, category management, goals, templates, budget transfers |
| Transactions | `/transactions` | List, server-side filter, bulk ops, add/edit |
| Accounts | `/accounts` | Account list, balances, reconciliation |
| Reports | `/reports` | 8 tabs with charts, category exclusions, and transaction drill-downs |
| Investments | `/investments` | Portfolio, lots, allocation, live pricing |
| FIRE | `/fire` | Calculator with interactive sliders |
| Assistant | `/assistant` | AI chat interface (with data consent) |
| Settings | `/settings` | Theme, profiles, import/export, rules, scheduled txns |

### State Management
- **No global state library** — Each page manages its own state via `useState`
- **Toast context** — `ToastProvider` (outermost) for notifications
- **Settings context** — `SettingsProvider` wraps the app for theme/currency/format
- **Profile context** — `ProfileProvider` wraps the app for multi-profile switching; it writes the `loot-council-profile` cookie from `localStorage` on start-up so the first API calls use the right profile
- **Keyboard context** — `KeyboardShortcutsProvider` for global shortcuts
- **Per-profile preferences** in `localStorage`: transaction filters, report category exclusions, last-used transaction account

### Component Architecture
- **31 custom components** — No UI library (all Tailwind-based)
- **Modal pattern** — Shared accessible `ModalDialog` (focus trap, Escape, scroll lock)
- **Form pattern** — Controlled inputs with async submit
- See [Component Inventory](./component-inventory.md) for full catalog

---

## 7. Testing Strategy

Vitest runs pure unit tests and SQLite integration tests that call the route handlers directly. `npm test` first runs `scripts/prepare-test-db.mjs`, which rebuilds `data/loot-council-test.db` from the committed migrations (`prisma migrate deploy`) and fails if `schema.prisma` has drifted from them. The working budget database is never touched.

- `npm test` prepares the test database and runs the suite once
- `npm run test:watch` runs the suite in watch mode
- CI requires lint, typecheck, tests, a production build, and a clean production `npm audit`
- Coverage includes budget month helpers, rule matching, schedule date arithmetic, local date helpers, profile ownership and isolation, money paths (transactions, transfers, reconciliation), CSV import, split activity, budget invariants, investment currency conversion, and the Pass 4 audit regressions

See the [Development Guide](./development-guide.md#testing) for the per-file list.

---

## 8. Runtime Environment

### How It Runs
The app runs only on the user's Windows PC. `start-budget.bat` opens `http://127.0.0.1:3000` and runs `npm run dev`. Both `npm run dev` and `npm run start` bind to `127.0.0.1`, so the app is not reachable from other devices.

```bash
npm run dev          # Turbopack dev server (127.0.0.1:3000)
npx prisma studio    # Database GUI (localhost:5555)
npm run build        # Production build
npm run start        # Production server (127.0.0.1 only)
```

### Infrastructure Requirements
- **Node.js 20.9+** on the local machine
- **No cloud infrastructure** — runs entirely locally
- **GitHub Actions CI** — lint, typecheck, isolated tests, production build, and dependency audit on pushes and pull requests to `main`

---

## 9. Security Considerations

| Concern | Status | Notes |
|---------|--------|-------|
| API Authentication | ⚠️ None | All routes open; server binds to 127.0.0.1 only |
| Data Privacy | ✅ Local | All data on user's machine |
| API Key Storage | ⚠️ Plain text | OpenAI key in `.env`, Binance in DB (masked in API responses) |
| Financial Data to AI | ✅ Consent gate | AI data sharing requires explicit local consent |
| Input Validation | ✅ Zod on every route | Request bodies are parsed with shared schemas in `src/lib/validation.ts` (money, dates, ids, bounded text); invalid input returns 400 with a readable message; ownership is still checked via `profileOwnership.ts` |
| Error Leakage | ✅ Generic responses | Detailed failures are logged server-side; clients receive generic errors |

See [ISSUES.md](../ISSUES.md) for detailed security tracking.

---

## 10. Known Issues & Technical Debt

The project maintains an `ISSUES.md` tracking file. All critical issues (CRIT-0 to CRIT-7) and security concerns (SEC-1 to SEC-6) are resolved, as are the four product-audit passes (AUD-1 to AUD-44, Pass 4 dated 2026-10-24) apart from the items below.

Still open:

- **FEAT-6** — PWA / offline support
- **FEAT-9b** — Overspending toast on transaction creation
- **AUD-14** — Orphaned rows with `NULL profileId` (needs a decision)
- **AUD-22** — `MonthlyBudget.activity` is a write-only column (needs a decision)
