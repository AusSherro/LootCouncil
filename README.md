<div align="center">

# 💰 Loot Council

### *Take control of your money.*

**A local-first, privacy-focused personal finance app.**<br/>
**Zero-based envelope budgeting • Investment tracking • FIRE planning • AI advisor**

<br/>

[![Next.js](https://img.shields.io/badge/Next.js_16-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript_5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Prisma](https://img.shields.io/badge/Prisma_6-2D3748?style=for-the-badge&logo=prisma&logoColor=white)](https://www.prisma.io/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?style=for-the-badge&logo=sqlite&logoColor=white)](https://www.sqlite.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS_4-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-D4A017?style=for-the-badge)](LICENSE)

<br/>

> 🔒 **Your data stays on YOUR machine.** No cloud. No tracking. No subscriptions.<br/>
> 📊 Every dollar gets a job. Your finances, your rules.

<br/>

---

</div>

## 📑 Table of Contents

- [Why Loot Council?](#-why-loot-council)
- [Features](#-features)
- [Tech Stack](#%EF%B8%8F-tech-stack)
- [Getting Started](#-getting-started)
- [Project Structure](#-project-structure)
- [Themes](#-themes)
- [Keyboard Shortcuts](#%EF%B8%8F-keyboard-shortcuts)
- [Database Schema](#-database-schema)
- [Contributing](#-contributing)
- [License](#-license)

---

## 💡 Why Loot Council?

Most budgeting apps want your data in their cloud and a monthly subscription fee. **Loot Council** takes a different approach:

| | Loot Council | Typical SaaS |
|---|:---:|:---:|
| **Data ownership** | ✅ 100% local | ❌ Their servers |
| **Subscription** | ✅ Free forever | ❌ $10-15/mo |
| **Privacy** | ✅ Zero telemetry | ❌ Data harvesting |
| **Offline access** | ✅ Works offline | ❌ Requires internet |
| **Open source** | ✅ MIT license | ❌ Proprietary |
| **YNAB methodology** | ✅ Full support | 🟡 Varies |
| **Investment tracking** | ✅ Built-in | ❌ Separate app |
| **FIRE calculator** | ✅ Built-in | ❌ Separate tool |

---

## ✨ Features

<table>
<tr>
<td width="50%" valign="top">

### 💰 Core Budgeting
- **Envelope-style** zero-based budgeting
- "Ready to Assign" — give every dollar a job
- Split transactions across categories
- Transfer tracking between accounts
- Reconciliation mode (cleared/reconciled)
- Age of Money metric

</td>
<td width="50%" valign="top">

### ⚡ Smart Automation
- Auto-categorize via payee pattern rules
- Budget templates — save & reuse setups
- Quick actions — last month / average / underfunded
- Copy budgets from previous months
- Auto-assign to fund category goals
- Scheduled recurring transactions

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🎯 Goals & Tracking
- **Target Balance** — Save to a specific amount
- **Target by Date** — Deadline-based saving
- **Monthly Funding** — Fixed recurring amount
- **Spending Goal** — Plan expected spending
- **Debt Payoff** — Track debt reduction
- Visual progress bars & overspending alerts

</td>
<td width="50%" valign="top">

### 📈 Investment Portfolio
- Stocks, ETFs, crypto, property & super
- Multi-currency with AUD conversion
- Yahoo Finance & CoinGecko live prices
- Purchase lots with CGT tracking
- Asset allocation targets vs actual
- Binance wallet sync integration

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔥 FIRE Calculator
- Years to Financial Independence
- Safe Withdrawal Rate (customizable)
- Coast FIRE & Barista FIRE modes
- Australian super integration
- Interactive sliders for scenario planning

</td>
<td width="50%" valign="top">

### 📊 Advanced Reports
- Spending breakdown by category (pie)
- Income vs Expense trends (bar)
- Net Worth over time (line)
- Spending by payee analysis
- Category trends across months
- All-time historical data view

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🤖 AI Features <sup>optional</sup>
- Chat-based financial advisor
- Auto-categorize transactions
- AI-generated spending insights
- Budget optimization suggestions

</td>
<td width="50%" valign="top">

### 📦 Data Management
- YNAB import (ZIP backup + API)
- CSV transaction import
- Full JSON backup & restore
- Payee management (merge/rename)
- Bulk transaction editing

</td>
</tr>
</table>

---

## 🏗️ Tech Stack

<table>
<tr>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/nextjs/nextjs-original.svg" width="48" height="48" alt="Next.js" />
<br/><sub><b>Next.js 16</b></sub>
</td>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/typescript/typescript-original.svg" width="48" height="48" alt="TypeScript" />
<br/><sub><b>TypeScript 5</b></sub>
</td>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/sqlite/sqlite-original.svg" width="48" height="48" alt="SQLite" />
<br/><sub><b>SQLite</b></sub>
</td>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/prisma/prisma-original.svg" width="48" height="48" alt="Prisma" />
<br/><sub><b>Prisma 6</b></sub>
</td>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/tailwindcss/tailwindcss-original.svg" width="48" height="48" alt="Tailwind" />
<br/><sub><b>Tailwind 4</b></sub>
</td>
<td align="center" width="96">
<img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/react/react-original.svg" width="48" height="48" alt="React" />
<br/><sub><b>React 19</b></sub>
</td>
</tr>
</table>

<details>
<summary><b>Full dependency breakdown</b></summary>
<br/>

| Layer | Technology | Version | Purpose |
|-------|------------|---------|---------|
| Framework | Next.js (App Router + Turbopack) | 16.1.6 | Full-stack React framework |
| Language | TypeScript (strict mode) | 5.x | Type safety |
| Database | SQLite | — | Local-first data storage |
| ORM | Prisma | 6.19.2 | Database access & migrations |
| Styling | Tailwind CSS | 4.x | Utility-first CSS |
| Icons | Lucide React | 0.563.0 | Consistent icon system |
| Charts | Recharts | 3.7.0 | Data visualization |
| AI | OpenAI API | 6.17.0 | Financial advisor & insights |
| Stock Data | yahoo-finance2 | 3.13.0 | Stock prices & symbol lookup |
| Crypto Data | CoinGecko API | — | Cryptocurrency prices |
| Exchange Rates | exchangerate-api.com | — | Currency conversion (1hr cache) |
| Crypto Sync | Binance API | — | Direct wallet sync |
| Spreadsheets | xlsx + jszip | 0.18.5 | YNAB import parsing |
| Drag & Drop | dnd-kit | 6.3.1 | Category reordering |

</details>

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org/))
- **npm** (included with Node.js) or **pnpm**

### Quick Start

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/loot-council.git
cd loot-council

# 2. Install dependencies
npm install

# 3. Set up the database
npx prisma generate
npx prisma db push

# 4. Start the app
npm run dev
```

Open **[http://localhost:3000](http://localhost:3000)** to get started!

### ⚙️ Environment Variables

Create a `.env` file in the project root:

```env
# Required
DATABASE_URL="file:./loot-council.db"

# Optional — AI Features (OpenAI)
OPENAI_API_KEY="sk-..."

# Optional — Currency & Investments
HOME_CURRENCY="AUD"

# Optional — Binance Wallet Sync
BINANCE_API_KEY="..."
BINANCE_API_SECRET="..."
```

> 💡 The app works fully without any API keys — AI features and Binance sync are opt-in extras.

---

## 📁 Project Structure

```
loot-council/
├── prisma/
│   ├── schema.prisma         # Database schema (17 models)
│   └── migrations/           # Database migrations
├── src/
│   ├── app/
│   │   ├── api/              # 46 API routes across 26 domains
│   │   │   ├── accounts/     # Account CRUD
│   │   │   ├── ai/           # AI features (chat, categorize, insights, optimize)
│   │   │   ├── budget/       # Budget operations (auto-assign, copy, quick-actions)
│   │   │   ├── categories/   # Category management
│   │   │   ├── transactions/ # Transaction CRUD (bulk, splits, transfers)
│   │   │   ├── investments/  # Portfolio (holdings, lots, prices, allocations)
│   │   │   ├── fire/         # FIRE calculator
│   │   │   ├── binance/      # Binance wallet sync
│   │   │   ├── import/       # Data import (YNAB, CSV, backup)
│   │   │   ├── export/       # JSON backup export
│   │   │   └── ...           # + 16 more domains
│   │   ├── budget/           # Budget page
│   │   ├── transactions/     # Transactions page
│   │   ├── accounts/         # Accounts page
│   │   ├── reports/          # Reports page
│   │   ├── investments/      # Portfolio page
│   │   ├── fire/             # FIRE calculator page
│   │   ├── settings/         # Settings page
│   │   └── wizard/           # AI assistant page
│   ├── components/           # 26 React components
│   ├── lib/                  # Utilities, hooks & helpers
│   └── generated/            # Prisma client (auto-generated)
└── public/                   # Static assets
```

---

## 🎨 Themes

Five handcrafted dark color themes to match your style:

<table>
<tr>
<td align="center">
<img src="https://via.placeholder.com/80/D4A017/D4A017?text=+" alt="Dungeon" /><br/>
<b>🌑 Dungeon</b><br/>
<sub>Dark + Gold Accents</sub><br/>
<sup>(Default)</sup>
</td>
<td align="center">
<img src="https://via.placeholder.com/80/7cb342/7cb342?text=+" alt="Forest" /><br/>
<b>🌿 Forest</b><br/>
<sub>Earthy Greens</sub>
</td>
<td align="center">
<img src="https://via.placeholder.com/80/4fc3f7/4fc3f7?text=+" alt="Ocean" /><br/>
<b>🌊 Ocean</b><br/>
<sub>Deep Blues</sub>
</td>
<td align="center">
<img src="https://via.placeholder.com/80/ef5350/ef5350?text=+" alt="Crimson" /><br/>
<b>🔴 Crimson</b><br/>
<sub>Bold Reds</sub>
</td>
<td align="center">
<img src="https://via.placeholder.com/80/ab47bc/ab47bc?text=+" alt="Royal" /><br/>
<b>👑 Royal</b><br/>
<sub>Rich Purples</sub>
</td>
</tr>
</table>

---

## ⌨️ Keyboard Shortcuts

| Shortcut | Action |
|:---------|:-------|
| <kbd>↑</kbd> <kbd>↓</kbd> | Navigate list items |
| <kbd>Enter</kbd> | Edit selected item |
| <kbd>Escape</kbd> | Deselect / Cancel |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> | Undo last action |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> | Redo action |
| <kbd>Ctrl</kbd>+<kbd>A</kbd> | Select all transactions |
| <kbd>Delete</kbd> | Delete selected |

---

## 📊 Database Schema

<details>
<summary><b>17 Prisma models across 7 domains</b></summary>
<br/>

**Core Budgeting**
| Model | Description |
|-------|-------------|
| `Account` | Bank accounts, credit cards, investments (balance in cents) |
| `CategoryGroup` | Category organization / grouping |
| `Category` | Budget categories with goal types (TB, TBD, MF, NEED, DEBT) |
| `MonthlyBudget` | Monthly allocations — assigned, activity, available |

**Transactions**
| Model | Description |
|-------|-------------|
| `Transaction` | All financial transactions |
| `SubTransaction` | Split transaction line items |
| `TransactionRule` | Auto-categorization rules (match by payee/memo/amount) |
| `ScheduledTransaction` | Recurring bills and income |

**Investments**
| Model | Description |
|-------|-------------|
| `Asset` | Holdings — stocks, crypto, property, super (with dividend/staking yields) |
| `AssetLot` | Individual purchase lots with CGT tracking |
| `AllocationTarget` | Target portfolio allocations by asset class |

**Configuration**
| Model | Description |
|-------|-------------|
| `Settings` | App config — theme, currency, date format |
| `FireSettings` | FIRE preferences — withdrawal rate, super, inflation |
| `ExchangeRate` | Cached currency rates (1hr TTL) |
| `BudgetTemplate` | Saved budget configurations |
| `BudgetTemplateItem` | Template line items |
| `Payee` | Payee management |

</details>

---

## 🔧 Development

```bash
# Start dev server (Turbopack)
npm run dev

# Build for production
npm run build

# View/edit database in browser
npx prisma studio

# Regenerate Prisma client after schema changes
npx prisma generate

# Push schema changes to database
npx prisma db push
```

---

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/your-feature`)
3. **Commit** your changes (`git commit -m 'Add your feature'`)
4. **Push** to the branch (`git push origin feature/your-feature`)
5. **Open** a Pull Request

> Please make sure your code passes `npm run build` before submitting.

---

## 📝 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
<br/>

**Built with 💰 for people who take their money seriously.**

*Your data. Your budget. Your rules.*

<br/>

[Report Bug](../../issues) · [Request Feature](../../issues) · [Documentation](docs/)

<br/>

<sub>If Loot Council helps you take control of your finances, consider giving it a ⭐</sub>

</div>
