# Loot Council — Component Inventory

> **Generated:** 2026-02-12 | **Scan Level:** Quick (pattern-based)

---

## Overview

The application has **26 React components** in `src/components/`, all client-side (`'use client'`). Components follow a consistent pattern of modals, forms, and context providers with no component library — all custom-built with Tailwind CSS.

---

## Component Catalog

### Layout & Navigation

| Component | File | Description |
|-----------|------|-------------|
| Sidebar | `Sidebar.tsx` | Desktop sidebar navigation with 7 items + mobile hamburger menu |
| MobileNav | `MobileNav.tsx` | Bottom navigation bar for mobile (5 items) |

### Modal Components

| Component | File | Description |
|-----------|------|-------------|
| TransactionForm | `TransactionForm.tsx` | Add/edit transaction modal with account/category selection |
| SplitTransactionModal | `SplitTransactionModal.tsx` | Split transaction across multiple categories |
| GoalEditorModal | `GoalEditorModal.tsx` | Category goal configuration (TB, TBD, MF, NEED, DEBT) |
| QuickTransferModal | `QuickTransferModal.tsx` | Quick account-to-account transfer |
| CreditCardPaymentModal | `CreditCardPaymentModal.tsx` | Credit card payment workflow |
| AddAssetModal | `AddAssetModal.tsx` | Investment asset add/edit with symbol lookup |
| BudgetTemplatesModal | `BudgetTemplatesModal.tsx` | Budget template save/load management |
| CSVImportModal | `CSVImportModal.tsx` | CSV file import wizard with column mapping |
| ReconciliationModeModal | `ReconciliationModeModal.tsx` | Account reconciliation workflow |
| ConfirmDialog | `ConfirmDialog.tsx` | Reusable confirmation dialog (via `useConfirmDialog` hook) |

### Data Display

| Component | File | Description |
|-----------|------|-------------|
| GoalProgress | `GoalProgress.tsx` | Goal progress bar with percentage and remaining |
| Sparkline | `Sparkline.tsx` | Mini inline sparkline charts |
| LoadingSkeleton | `LoadingSkeleton.tsx` | Page-level loading skeleton states |
| Skeleton | `Skeleton.tsx` | Base skeleton animation component |

### Input Components

| Component | File | Description |
|-----------|------|-------------|
| InlineEdit | `InlineEdit.tsx` | Click-to-edit inline text component |
| PayeeAutocomplete | `PayeeAutocomplete.tsx` | Payee input with autocomplete suggestions |

### Settings & Management

| Component | File | Description |
|-----------|------|-------------|
| PayeeManagement | `PayeeManagement.tsx` | Full payee CRUD with merge/rename |
| TransactionRulesSettings | `TransactionRulesSettings.tsx` | Transaction rule management UI |
| ScheduledTransactions | `ScheduledTransactions.tsx` | Scheduled transaction list and management |

### Providers & System

| Component | File | Description |
|-----------|------|-------------|
| SettingsProvider | `SettingsProvider.tsx` | React Context provider for app settings |
| KeyboardShortcutsProvider | `KeyboardShortcutsProvider.tsx` | Global keyboard shortcut registration |
| ErrorBoundary | `ErrorBoundary.tsx` | React error boundary wrapper |

### Feedback & Notifications

| Component | File | Description |
|-----------|------|-------------|
| Toast | `Toast.tsx` | Toast notification component |
| UndoToast | `UndoToast.tsx` | Floating undo/redo action bar |

---

## Design System Notes

- **No component library** — All components are custom-built
- **Styling:** Tailwind CSS 4 with CSS custom properties for theming
- **Modal pattern:** Fixed overlay (`z-50+`) with centered card
- **Form pattern:** Controlled inputs with `useState`, async submit handlers
- **Icons:** Lucide React (consistent across all components)
- **Themes:** 5 CSS class-based themes applied to `<html>` element
  - `theme-dungeon` (default) — Dark with gold accents
  - `theme-forest` — Green accents
  - `theme-ocean` — Blue accents
  - `theme-crimson` — Red/warm accents
  - `theme-royal` — Purple accents
- **Color tokens:** `text-gold`, `bg-background`, `bg-background-secondary`, `text-foreground`, `text-success`, `text-danger`, etc.

---

## Component Dependencies

```
layout.tsx
├── SettingsProvider          # Wraps entire app
├── KeyboardShortcutsProvider # Global shortcuts
├── Sidebar                   # Desktop nav
├── MobileNav                 # Mobile nav
├── UndoToast                 # Floating undo bar
└── ErrorBoundary             # Error handling

Page Components (each page)
├── LoadingSkeleton / Skeleton # Loading states
├── TransactionForm            # Shared transaction modal
├── ConfirmDialog              # Shared confirmation
├── Toast                      # Notifications
├── Sparkline                  # Data visualization
└── [Feature-specific modals]  # Per-page modals
```
