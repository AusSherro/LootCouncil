# Loot Council — Architecture Document

> **Generated:** 2026-03-04 | **Scan Level:** Comprehensive

---

## 1. Executive Summary

Loot Council is a **local-first personal finance application** built as a monolithic Next.js 16 application. It uses the App Router with client-rendered pages and API routes that access a local SQLite database via Prisma ORM. The architecture prioritizes privacy (no cloud), simplicity (single process), and feature richness (budgeting, investments, FIRE planning, AI advisor). A multi-profile system scopes all data per profile, allowing independent budgets on a single installation.

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
| Rendering Strategy | Client-side rendering (CSR) | All pages use `'use client'` with `useEffect` data fetching |
| Data Layer | Local SQLite via Prisma | Privacy-first, no cloud dependency, zero infrastructure |
| API Style | REST-like Next.js API routes | Simple, co-located with frontend, no separate backend |
| State Management | React `useState` + `useEffect` | No global store (Redux/Zustand); page-level state |
| Caching | Lightweight client cache | `src/lib/clientCache.ts` — in-memory TTL cache for dashboard & filter metadata |
| Authentication | None | Local-first design; single user per installation |
| Multi-Profile | Cookie/query param scoping | `Profile` model; `profileId` FK on all data models |
| Styling | Tailwind CSS + CSS variables | Theme system via CSS custom properties |
| AI Integration | Optional OpenAI API | Gracefully degrades without API key; data consent required |
| Error Handling | Centralized `withErrorHandler` | `src/lib/apiHandler.ts` wrapper for API routes |

---

## 3. Technology Stack

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| **Runtime** | Node.js | 18+ | Server runtime |
| **Framework** | Next.js (App Router) | 16.1.6 | Full-stack React framework |
| **Language** | TypeScript | 5.x | Type-safe development |
| **Database** | SQLite | — | Local file-based database |
| **ORM** | Prisma | 6.19.2 | Database access & migrations |
| **Styling** | Tailwind CSS | 4.x | Utility-first CSS |
| **Charts** | Recharts | 3.7.0 | Data visualizations |
| **Icons** | Lucide React | 0.563.0 | Icon library |
| **AI** | OpenAI SDK | 6.17.0 | Chat, categorization, insights |
| **Finance Data** | yahoo-finance2 | 3.13.0 | Stock/ETF pricing |
| **Spreadsheet** | xlsx + jszip | 0.18.5 | YNAB import parsing |
| **Drag & Drop** | dnd-kit | 6.3.1 | Sortable UI elements |
| **Build** | Turbopack | Built-in | Fast dev builds |
| **Linting** | ESLint | 9.x | Code quality |

---

## 4. Data Architecture

### Storage Strategy
- **Primary Store:** SQLite file (`prisma/loot-council.db`)
- **Schema Management:** Prisma Migrate (1 migration: initial schema)
- **Monetary Values:** All stored as integers in cents to avoid floating-point errors
- **IDs:** CUID strings (Prisma default)

### Data Flow

```
User Action → React State → fetch() → API Route → Prisma → SQLite
                                          ↓
                                   (Optional)
                              External API calls
                          (OpenAI, Yahoo, CoinGecko)
```

### Model Count: 18 models across 8 domains

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
- **46 API route files** across **28 domains**
- Standard REST patterns (GET/POST/PUT/PATCH/DELETE)
- Centralized error handling via `withErrorHandler` wrapper (`src/lib/apiHandler.ts`)
- No authentication layer
- No request validation framework (ad-hoc checks)
- Profile-scoped queries via `getProfileId()` helper (`src/lib/profile.ts`)

### External Integrations

| Service | Purpose | Auth | Caching |
|---------|---------|------|---------|
| OpenAI | AI chat, insights, optimization | API key in env | None |
| Yahoo Finance | Stock/ETF symbol lookup & pricing | None (free API) | None |
| CoinGecko | Crypto pricing & symbol lookup | None (free API) | None |
| Binance | Crypto wallet sync | API key/secret in DB | None |
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
| Reports | `/reports` | 5 chart types (spending, income, net worth, payee, trends) |
| Investments | `/investments` | Portfolio, lots, allocation, live pricing |
| FIRE | `/fire` | Calculator with interactive sliders |
| Assistant | `/assistant` | AI chat interface (with data consent) |
| Settings | `/settings` | Theme, profiles, import/export, rules, scheduled txns |

### State Management
- **No global state library** — Each page manages its own state via `useState`
- **Settings context** — `SettingsProvider` wraps the app for theme/currency/format
- **Profile context** — `ProfileProvider` wraps the app for multi-profile switching
- **Keyboard context** — `KeyboardShortcutsProvider` for global shortcuts
- **Undo system** — `useUndo` hook with action history stack

### Component Architecture
- **26 custom components** — No UI library (all Tailwind-based)
- **Modal pattern** — Fixed overlay + centered card
- **Form pattern** — Controlled inputs with async submit
- See [Component Inventory](./component-inventory.md) for full catalog

---

## 7. Testing Strategy

**Current state:** No test files detected in the project.

- No `__tests__/` directories found
- No `*.test.ts`, `*.spec.ts`, or `*.test.tsx` files found
- No test runner configured in `package.json`

---

## 8. Deployment Architecture

### Local Development
```bash
npm run dev          # Turbopack dev server (localhost:3000, 127.0.0.1 only)
npx prisma studio    # Database GUI (localhost:5555)
```

### Production Build
```bash
npm run build        # Next.js production build
npm run start        # Production server (127.0.0.1 only)
```

### Launch Script
`start-budget.bat` — Windows batch file that opens browser and starts the production server.

### Infrastructure Requirements
- **Node.js 18+** on the local machine
- **No cloud infrastructure** — Runs entirely locally
- **No Docker/container** configuration found
- **No CI/CD pipeline** configured (`.github/` contains only agent configs)

---

## 9. Security Considerations

| Concern | Status | Notes |
|---------|--------|-------|
| API Authentication | ⚠️ None | All routes open (local-first mitigates) |
| Data Privacy | ✅ Local | All data on user's machine |
| API Key Storage | ⚠️ Plain text | OpenAI key in `.env`, Binance in DB |
| Financial Data to AI | ⚠️ No consent | Data sent to OpenAI without explicit consent |
| Input Validation | ⚠️ Basic | Ad-hoc checks, no Zod schema validation |
| Error Leakage | ⚠️ Raw errors | Prisma errors exposed to client |

See [ISSUES.md](../loot-council/ISSUES.md) for detailed security tracking.

---

## 10. Known Issues & Technical Debt

The project maintains an `ISSUES.md` tracking file with categorized issues:

- **5 Critical issues** (all resolved ✅)
- **4 Security concerns** (2 resolved, 2 open)
- **5 Performance issues** (2 resolved, 3 open)
- **8 Code quality issues** (4 resolved, 4 open)
- **6 Error handling issues** (all resolved ✅)
- **10 Feature suggestions** (all open)

Key open items: SWR/caching adoption, server-side filtering, Zod validation, API error middleware.
