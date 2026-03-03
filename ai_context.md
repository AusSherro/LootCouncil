# Loot Council - AI Context & Developer Guide

## ⚔️ Project Overview
**Loot Council** is a local-first personal finance application. It combines serious zero-based budgeting (envelope method) with a fantasy RPG aesthetic.

### Core Philosophy
1. **Local-First**: Data lives on the user's machine (`sqlite`). Privacy first. No cloud dependency.
2. **Aesthetic**: "Dungeons & Dragons" meets "High Finance". Dark mode with gold accents, premium feel.
3. **YNAB-Inspired**: Envelope budgeting, "Ready to Assign", category goals - all inspired by YNAB methodology.

---

## 🛠️ Technology Stack
| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 16 | App Router with Turbopack |
| Language | TypeScript 5 | Strict mode |
| Database | SQLite | Local file: `loot-council.db` |
| ORM | Prisma 6 | Do NOT upgrade to 7 (driver issues) |
| Styling | Tailwind CSS 4 | Custom CSS variables in globals.css |
| Icons | Lucide React | Consistent icon library |
| Charts | Recharts | For all data visualizations |
| AI | OpenAI API | Optional: AI wizard features |
| Parsing | xlsx, jszip | YNAB import support |
| Stock Data | Yahoo Finance | Symbol lookup, price fetching |
| Crypto Data | CoinGecko API | Crypto prices and names |
| Exchange Rates | exchangerate-api.com | Currency conversion, 1hr cache |
| Binance | Binance API | Direct wallet sync |

---

## 📂 Project Structure
```
src/
├── app/
│   ├── api/                    # Backend API routes
│   │   ├── accounts/           # Account CRUD
│   │   ├── age-of-money/       # Age of Money calculation
│   │   ├── ai/                 # AI-powered features
│   │   │   ├── chat/           # Financial advisor chat
│   │   │   ├── insights/       # Spending insights
│   │   │   └── optimize/       # Budget optimization
│   │   ├── assets/             # Asset value management
│   │   ├── binance/            # Binance wallet sync
│   │   ├── budget/             # Budget operations
│   │   │   ├── auto-assign/    # Auto-assign goal funding
│   │   │   ├── quick-actions/  # Quick budget actions
│   │   │   ├── copy/           # Copy budget between months
│   │   │   └── transfer/       # Transfer funds between categories
│   │   ├── categories/         # Category management
│   │   ├── export/             # Data export (JSON backup)
│   │   ├── fire/               # FIRE calculator settings
│   │   ├── import/             # Data import
│   │   │   ├── backup/         # Restore from JSON backup
│   │   │   ├── csv/            # CSV import
│   │   │   ├── ynab/           # YNAB ZIP import
│   │   │   └── ynab-api/       # YNAB API import
│   │   ├── integrations/       # API integrations management
│   │   ├── investments/        # Investment portfolio
│   │   │   ├── route.ts        # Holdings CRUD with AUD conversion
│   │   │   ├── [id]/           # Individual asset operations
│   │   │   ├── lots/           # Purchase lot management
│   │   │   ├── prices/         # Symbol lookup, price fetching
│   │   │   └── allocations/    # Target vs current allocation
│   │   ├── networth/           # Net worth history
│   │   ├── payees/             # Payee operations
│   │   │   ├── manage/         # Payee CRUD, merge, rename
│   │   │   └── similar/        # Find similar payees
│   │   ├── profiles/           # Profile CRUD (multi-profile)
│   │   ├── quote/              # Random financial quotes
│   │   ├── reconcile/          # Account reconciliation
│   │   ├── reports/
│   │   │   └── advanced/       # Advanced reporting
│   │   ├── reset/              # Delete all data
│   │   ├── rules/              # Transaction rules CRUD
│   │   ├── scheduled/          # Scheduled transactions
│   │   ├── settings/           # App settings
│   │   ├── splits/             # Split transaction management
│   │   ├── templates/          # Budget templates CRUD
│   │   ├── transactions/       # Transaction CRUD
│   │   │   ├── [id]/           # Individual transaction operations
│   │   │   └── bulk/           # Bulk transaction operations
│   │   └── transfers/          # Transfer management
│   ├── budget/                 # Budget page
│   ├── transactions/           # Transactions page
│   ├── accounts/               # Accounts page
│   ├── reports/                # Reports page (5 report types)
│   ├── investments/            # Investment portfolio page
│   ├── fire/                   # FIRE calculator page
│   ├── assistant/              # AI assistant
│   ├── settings/               # Settings page (with profiles)
│   ├── globals.css             # Theme variables, animations
│   └── layout.tsx              # Root layout with providers
├── components/
│   ├── Sidebar.tsx             # Navigation (desktop + mobile)
│   ├── MobileNav.tsx           # Bottom navigation for mobile
│   ├── TransactionForm.tsx     # Add/edit transactions
│   ├── SplitTransactionModal.tsx # Split transaction editing
│   ├── GoalEditorModal.tsx     # Category goal editing
│   ├── GoalProgress.tsx        # Goal progress display
│   ├── PayeeAutocomplete.tsx   # Payee input with suggestions
│   ├── PayeeManagement.tsx     # Payee CRUD UI
│   ├── QuickTransferModal.tsx  # Quick account transfers
│   ├── CreditCardPaymentModal.tsx # Credit card payment workflow
│   ├── BudgetTemplatesModal.tsx # Budget template management
│   ├── BudgetTransferModal.tsx # Transfer between budget categories
│   ├── BudgetFlowBar.tsx       # Budget flow visualization
│   ├── CSVImportModal.tsx      # CSV file import UI
│   ├── ReconciliationModeModal.tsx # Reconciliation workflow
│   ├── ScheduledTransactions.tsx # Scheduled transaction list
│   ├── TransactionRulesSettings.tsx # Rule management UI
│   ├── ConfirmDialog.tsx       # Reusable confirmation dialog
│   ├── InlineEdit.tsx          # Inline text editing component
│   ├── Skeleton.tsx            # Loading skeleton component
│   ├── ErrorBoundary.tsx       # Error handling wrapper
│   ├── KeyboardShortcutsProvider.tsx # Global keyboard shortcuts
│   ├── ProfileProvider.tsx     # Multi-profile context provider
│   ├── UndoToast.tsx           # Undo/redo floating UI
│   ├── SettingsProvider.tsx    # Settings context
│   └── Toast.tsx               # Toast notification component
├── lib/
│   ├── prisma.ts               # Prisma client singleton
│   ├── openai.ts               # OpenAI client
│   ├── utils.ts                # Helper functions
│   ├── apiHandler.ts           # Centralized API error handler
│   ├── clientCache.ts          # Lightweight in-memory TTL cache
│   ├── navigation.ts           # Shared nav items (Sidebar/MobileNav)
│   └── profile.ts              # Profile ID resolution (cookie/query/fallback)
└── generated/prisma/           # Generated Prisma client
```

---

## ⚠️ Critical Development Directives

### 1. Database & Prisma
- **Version**: Use **Prisma 6**. Do NOT upgrade to Prisma 7 (driver adapter issues with Next.js 16 Turbopack).
- **Connection**: `DATABASE_URL="file:./loot-council.db"` in `.env`
- **Schema changes**: Always run `npx prisma generate` after changing `schema.prisma`
- **Client location**: Generated to `src/generated/prisma` (custom output path)
- **Multi-profile**: All data models have optional `profileId` FK. Use `getProfileId()` from `src/lib/profile.ts` in API routes.
- **Error handling**: Wrap API route handlers with `withErrorHandler()` from `src/lib/apiHandler.ts`

### 1.5. Environment Variables
```env
DATABASE_URL="file:./loot-council.db"
OPENAI_API_KEY="sk-..."           # Optional: AI wizard features
HOME_CURRENCY="AUD"               # Default currency for totals
BINANCE_API_KEY="..."             # Optional: Binance wallet sync
BINANCE_API_SECRET="..."          # Optional: Binance wallet sync
```

### 2. Styling Rules
Use semantic color names from CSS variables:
```css
/* Primary accent */
text-gold, bg-gold, border-gold

/* Backgrounds */
bg-background, bg-background-secondary, bg-background-tertiary

/* Text */
text-foreground, text-neutral

/* Semantic */
text-success, text-danger, text-warning, text-info
```

### 3. Component Patterns
- All pages are client components (`'use client'`)
- Use `useState` + `useEffect` for data fetching (not server components)
- Modal pattern: Fixed overlay with `z-50+`, centered card
- Form pattern: Controlled inputs with state, async submit handlers

### 4. API Route Patterns
```typescript
// Standard GET with error handler and profile scoping
import { withErrorHandler } from '@/lib/apiHandler';
import { getProfileId } from '@/lib/profile';

export const GET = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const { searchParams } = new URL(request.url);
    const param = searchParams.get('paramName');
    // ... fetch from Prisma with profile scoping
    return NextResponse.json({ data });
}, 'Fetch data');

// Standard POST with body
export const POST = withErrorHandler(async (request: NextRequest) => {
    const profileId = await getProfileId(request);
    const body = await request.json();
    // ... create in Prisma with profileId
    return NextResponse.json({ success: true, data });
}, 'Create record');
```

---

## 🧩 Feature Implementation Status

### ✅ Complete Features

| Feature | Description |
|---------|-------------|
| **Core Budgeting** | Envelope-style with Ready to Assign |
| **Split Transactions** | Multiple category assignments |
| **Transaction Rules** | Auto-categorize by payee |
| **Category Rollover** | Configurable surplus handling |
| **Budget Templates** | Save/apply budget configurations |
| **Reconciliation** | Mark as cleared/reconciled |
| **Transfer Matching** | Track account-to-account moves |
| **YNAB Import** | ZIP file import support |
| **Multiple Goal Types** | TB, TBD, MF, NEED, DEBT |
| **Advanced Reports** | 5 report types with charts, All Time view |
| **Payee Management** | Merge, rename, delete payees |
| **Bulk Transactions** | Select and edit multiple |
| **Keyboard Shortcuts** | Arrow navigation, Ctrl+Z undo |
| **Mobile Responsive** | Bottom nav, hamburger menu |
| **Undo/Redo System** | Action history with revert |
| **Loading Skeletons** | Smooth loading states |
| **Error Boundaries** | Graceful error handling |
| **5 Color Themes** | Dungeon, Forest, Ocean, Crimson, Royal |
| **Quick Budget Actions** | Last month, average, underfunded |
| **Copy Budget** | Clone between months |
| **Overspending Alerts** | Visual warnings |
| **Net Worth Tracking** | Historical chart |
| **Investment Portfolio** | Multi-asset tracking with lots |
| **Multi-Currency** | Track any currency, AUD totals |
| **Symbol Lookup** | Yahoo Finance for stocks, CoinGecko for crypto |
| **Asset Allocation** | Target vs current percentages |
| **Capital Gains** | Unrealized gains tracking |
| **Binance Sync** | Direct crypto wallet integration |
| **FIRE Calculator** | FI projections with Coast/Barista FIRE |
| **Exchange Rates** | Cached currency conversion (1hr TTL) |
| **Scheduled Transactions** | Recurring bills and income |
| **AI Advisor** | AI-powered financial chat and insights |
| **CSV Import** | Import transactions from CSV files |
| **Age of Money** | Track how old your money is |
| **Auto-Assign Goals** | Automatically fund goal categories |
| **Credit Card Payments** | Track credit card payment workflow |
| **Multi-Profile** | Independent profiles with separate data |
| **Budget Transfers** | Transfer funds between budget categories |
| **Budget Flow Bar** | Visual income → assigned → available flow |
| **Server-Side Filtering** | Transaction filtering on the API |
| **Client Cache** | Lightweight in-memory TTL cache for API reads |
| **API Error Handler** | Centralized error handling via withErrorHandler |
| **Shared Navigation** | Sidebar/MobileNav use shared nav config |
| **AI Data Consent** | Consent modal before sending data to OpenAI |
| **Global New Txn Shortcut** | Press N anywhere to add a new transaction |

### 🚧 Planned Features

| Feature | Notes |
|---------|-------|
| Bank sync | Plaid/Open Banking integration |
| Budget % allocation | Show spending as % of income |

---

## 📊 Database Schema (Key Models)

```prisma
model Profile {
  id        String   @id @default(cuid())
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  // Has many: accounts, categoryGroups, payees, transfers, assets, etc.
}

model Account {
  id              String   @id @default(cuid())
  name            String
  type            String   // checking, savings, credit, investment
  onBudget        Boolean  @default(true)
  balance         Int      @default(0)  // cents
  clearedBalance  Int      @default(0)
  closed          Boolean  @default(false)
  lastReconciled  DateTime?
  linkedAccountId String?  // For credit cards: link to payment account
  profileId       String?  // FK to Profile
}

model Transaction {
  id           String   @id @default(cuid())
  date         DateTime
  amount       Int      // cents (positive = inflow, negative = outflow)
  payee        String?
  memo         String?
  accountId    String
  categoryId   String?
  cleared      Boolean  @default(false)
  approved     Boolean  @default(true)
  isReconciled Boolean  @default(false)
  isSplit      Boolean  @default(false)
  transferId   String?  // Links two transactions for transfers
}

model SubTransaction {
  id            String @id @default(cuid())
  transactionId String
  categoryId    String?
  amount        Int    // cents
  memo          String?
}

model Category {
  id           String   @id @default(cuid())
  name         String
  groupId      String
  isHidden     Boolean  @default(false)
  goalType     String?  // TB, TBD, MF, NEED, DEBT
  goalTarget   Int?     // cents
  goalDueDate  DateTime?
  sortOrder    Int      @default(0)
  rolloverType String   @default("available") // available, none, cap
  rolloverCap  Int?     // Max rollover amount (cents) if type = cap
  // Additional goal progress fields from YNAB import
  goalPercentageComplete Int?
  goalUnderFunded        Int?
  goalOverallFunded      Int?
  goalOverallLeft        Int?
  goalCadence            Int?
  goalCadenceFrequency   Int?
  goalDay                Int?
}

model MonthlyBudget {
  id         String @id @default(cuid())
  categoryId String
  month      String // "YYYY-MM"
  assigned   Int    @default(0) // cents
  activity   Int    @default(0) // cents
  available  Int    @default(0) // cents
  @@unique([month, categoryId])
}

model TransactionRule {
  id           String  @id @default(cuid())
  name         String
  matchField   String  // payee, memo, amount
  matchType    String  // contains, equals, startsWith, endsWith, regex
  matchValue   String
  categoryId   String?
  payeeRename  String? // Optional: rename the payee
  memoTemplate String? // Optional: set memo
  priority     Int     @default(0) // Higher = checked first
  isActive     Boolean @default(true)
}

model BudgetTemplate {
  id    String               @id @default(cuid())
  name  String
  items BudgetTemplateItem[]
}

model BudgetTemplateItem {
  id         String @id @default(cuid())
  templateId String
  categoryId String
  amount     Int    // cents
}

model ScheduledTransaction {
  id           String    @id @default(cuid())
  name         String    // "Netflix", "Rent", etc.
  amount       Int       // cents (negative for expenses)
  payee        String?
  memo         String?
  accountId    String
  categoryId   String?
  frequency    String    // daily, weekly, biweekly, monthly, yearly
  nextDueDate  DateTime
  dayOfMonth   Int?
  dayOfWeek    Int?
  endDate      DateTime?
  autoCreate   Boolean   @default(false)
  reminderDays Int       @default(3)
  isActive     Boolean   @default(true)
}

// Investment Portfolio Models

model Asset {
  id             String     @id @default(cuid())
  symbol         String     // MSFT, BTC, etc.
  name           String
  assetClass     String     // stock, etf, crypto, property, super, cash, other
  currency       String     @default("AUD")
  quantity       Float      @default(1)
  costBasis      Int        @default(0) // Total cost in cents
  currentPrice   Int        @default(0) // cents per unit (or total for manual)
  isManual       Boolean    @default(false)
  annualDividend Int        @default(0) // cents
  dividendYield  Float      @default(0)
  stakingYield   Float      @default(0) // for crypto
  lots           AssetLot[]
}

model AssetLot {
  id           String    @id @default(cuid())
  assetId      String
  purchaseDate DateTime
  units        Float
  unitPrice    Int       // cents per unit
  totalCost    Int       // cents including fees
  brokerage    Int       @default(0) // cents
  soldUnits    Float     @default(0)
  soldDate     DateTime?
  salePrice    Int?      // cents per unit
  saleTotal    Int?      // cents
  capitalGain  Int?      // cents
  cgtDiscount  Boolean   @default(false) // held > 12 months
}

model AllocationTarget {
  id         String @id @default(cuid())
  assetClass String @unique // etf, stock, crypto, cash, super, property, other
  targetPct  Float  // decimal (0.30 = 30%)
  priority   Int    @default(0)
}

model FireSettings {
  id                  String @id @default(cuid())
  yearOfBirth         Int    @default(1990)
  retirementAge       Int    @default(60)
  preservationAge     Int    @default(60)
  annualExpenses      Int    @default(0) // cents
  withdrawalRate      Float  @default(0.04)
  inflationRate       Float  @default(0.025)
  expectedReturn      Float  @default(0.07)
  annualSuperContrib  Int    @default(0) // cents
  employerContribRate Float  @default(0.115)
  fireNumber          Int    @default(0) // cents
  coastFireNumber     Int    @default(0) // cents
  profileId           String? // FK to Profile
}

model ExchangeRate {
  id           String   @id @default(cuid())
  fromCurrency String
  toCurrency   String
  rate         Float
  lastUpdated  DateTime @default(now())
  @@unique([fromCurrency, toCurrency])
}

model Settings {
  id           String   @id @default(cuid())
  budgetName   String   @default("My Realm")
  currency     String   @default("AUD")
  dateFormat   String   @default("DD/MM/YYYY")
  startOfWeek  Int      @default(1) // 0=Sunday, 1=Monday
  theme        String   @default("finance")
  toBeBudgeted Int      @default(0) // Ready to Assign (cents)
  profileId    String?  // FK to Profile
}

// Also: Payee, Transfer, CategoryGroup, ApiIntegration (see schema.prisma for full details)
```

---

## 🔄 Common Development Commands

```bash
# Start dev server (Turbopack, bound to 127.0.0.1)
npm run dev

# View database
npx prisma studio

# Regenerate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# Reset database (nuclear option)
# Use Settings > Delete All Data, or: DELETE /api/reset

# Build for production
npm run build
```

---

## 🎨 Theme System

Themes are CSS class-based (applied to `<html>`):
- `theme-dungeon` — Default dark with gold
- `theme-forest` — Green accents
- `theme-ocean` — Blue accents
- `theme-crimson` — Red/warm accents
- `theme-royal` — Purple accents
- `theme-finance` — Clean professional finance look

Theme is stored in `localStorage` as `loot-council-theme`.

---

## 📱 Mobile Support

- Breakpoint: `lg:` (1024px) for desktop sidebar
- Mobile gets: Top header bar, hamburger menu, bottom nav
- Main content has `pt-16 lg:pt-0 pb-20 lg:pb-0` for mobile chrome

---

## 🔑 Key Files for AI Context

When working on specific features, these files are most relevant:

| Feature | Key Files |
|---------|-----------|
| Budget logic | `app/budget/page.tsx`, `api/budget/route.ts` |
| Budget transfers | `components/BudgetTransferModal.tsx`, `api/budget/transfer/route.ts` |
| Transactions | `app/transactions/page.tsx`, `api/transactions/route.ts` |
| Split transactions | `components/SplitTransactionModal.tsx`, `api/splits/route.ts` |
| Categories/Goals | `components/GoalEditorModal.tsx`, `api/categories/route.ts` |
| Transaction rules | `components/TransactionRulesSettings.tsx`, `api/rules/route.ts` |
| Budget templates | `components/BudgetTemplatesModal.tsx`, `api/templates/route.ts` |
| Scheduled txns | `components/ScheduledTransactions.tsx`, `api/scheduled/route.ts` |
| Reports | `app/reports/page.tsx`, `api/reports/advanced/route.ts` |
| Investments | `app/investments/page.tsx`, `api/investments/route.ts` |
| Symbol Lookup | `api/investments/prices/route.ts` |
| Asset Lots | `api/investments/lots/route.ts` |
| Allocations | `api/investments/allocations/route.ts` |
| FIRE Calculator | `app/fire/page.tsx`, `api/fire/route.ts` |
| Binance Sync | `api/binance/route.ts` |
| Net Worth | `api/networth/route.ts` |
| Reconciliation | `components/ReconciliationModeModal.tsx`, `api/reconcile/route.ts` |
| Credit cards | `components/CreditCardPaymentModal.tsx` |
| Payee management | `components/PayeeManagement.tsx`, `api/payees/manage/route.ts` |
| CSV import | `components/CSVImportModal.tsx`, `api/import/csv/route.ts` |
| AI features | `api/ai/chat/route.ts`, `api/ai/insights/route.ts`, `lib/openai.ts` |
| Profiles | `components/ProfileProvider.tsx`, `api/profiles/route.ts`, `lib/profile.ts` |
| Settings | `app/settings/page.tsx`, `components/SettingsProvider.tsx` |
| Mobile UI | `components/Sidebar.tsx`, `components/MobileNav.tsx`, `lib/navigation.ts` |
| Undo/Redo | `lib/useUndo.tsx`, `components/UndoToast.tsx` |
| Keyboard nav | `lib/useKeyboardShortcuts.tsx`, `components/KeyboardShortcutsProvider.tsx` |
| Error handling | `lib/apiHandler.ts` |
| Client caching | `lib/clientCache.ts` |

### Investment API Details

The investment system uses multi-currency support:
- Assets store native `currency` (USD, AUD, etc.) and `assetClass` (stock, etf, crypto, property, super, cash, other)
- API returns `currentValueAUD`, `totalCostBasisAUD`, `totalReturnAUD` for each asset
- Summary totals are always in AUD (HOME_CURRENCY)
- Exchange rates cached in `ExchangeRate` table with 1-hour TTL
- Symbol lookup: Yahoo Finance for stocks/ETFs, CoinGecko for crypto
- Binance sync stores quantity directly in `Asset.quantity` (no lots)
- Capital gains tracking is per-lot in `AssetLot` (soldUnits, salePrice, capitalGain, cgtDiscount)
