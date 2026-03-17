# Loot Council — Changelog

All notable changes to this project will be documented in this file.

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
