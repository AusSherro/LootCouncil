# Loot Council — Component Inventory

> **Generated:** 2026-03-04 (last verified 2026-11-04) | **Scan Level:** Comprehensive

---

## Overview

The application has **31 React component files** in `src/components/`. Components follow a consistent pattern of modals, forms, and context providers with no component library — all custom-built with Tailwind CSS.

---

## Component Catalog

### Layout & Navigation

| Component | File | Description |
|-----------|------|-------------|
| Sidebar | `Sidebar.tsx` | Desktop-only sidebar (shown from the `md` breakpoint) with 7 items + Settings and the profile switcher menu; items come from `src/lib/navigation.ts` |
| MobileNav | `MobileNav.tsx` | Bottom navigation bar for mobile (5 items: Budget, Transactions, Accounts, Reports, Settings) |

### Modal Components

| Component | File | Description |
|-----------|------|-------------|
| ModalDialog | `ModalDialog.tsx` | Accessible dialog shell shared by modal surfaces |
| TransactionForm | `TransactionForm.tsx` | Add/edit transaction modal with account/category selection; loads existing splits, can un-split, and remembers the last-used account per profile (`src/lib/transactionFormPreferences.ts`) |
| SplitTransactionModal | `SplitTransactionModal.tsx` | Split a transaction across categories; loads existing splits and supports removing the split |
| GoalEditorModal | `GoalEditorModal.tsx` | Category goal configuration (TB, TBD, MF, NEED, DEBT) |
| QuickTransferModal | `QuickTransferModal.tsx` | Quick account-to-account transfer |
| CreditCardPaymentModal | `CreditCardPaymentModal.tsx` | Credit card payment workflow |
| BudgetTemplatesModal | `BudgetTemplatesModal.tsx` | Budget template save/load management |
| BudgetTransferModal | `BudgetTransferModal.tsx` | Transfer funds between budget categories |
| ForecastModal | `ForecastModal.tsx` | Budget forecast with projected balance chart |
| CSVImportModal | `CSVImportModal.tsx` | CSV file import wizard with column mapping |
| ReconciliationModeModal | `ReconciliationModeModal.tsx` | Account reconciliation workflow |
| ConfirmDialog | `ConfirmDialog.tsx` | Reusable confirmation dialog (via `useConfirmDialog` hook) |

### Data Display

| Component | File | Description |
|-----------|------|-------------|
| GoalProgress | `GoalProgress.tsx` | Goal progress bar with percentage and remaining |
| BudgetFlowBar | `BudgetFlowBar.tsx` | Budget flow visualization (income → assigned → available) |
| AnimatedNumber | `AnimatedNumber.tsx` | Smooth animated number transitions |
| GoldCoinSpinner | `GoldCoinSpinner.tsx` | Themed loading spinner |
| ChartTooltip | `ChartTooltip.tsx` | Reusable Recharts tooltip with currency formatting |
| Skeleton | `Skeleton.tsx` | Loading placeholders: `SkeletonCard`, `SkeletonTransactionList`, `SkeletonDashboard` |

### Input Components

| Component | File | Description |
|-----------|------|-------------|
| InlineEdit | `InlineEdit.tsx` | Exports `InlineCategorySelect`, the searchable inline category picker on the Transactions page (split rows show a Split label instead) |
| PayeeAutocomplete | `PayeeAutocomplete.tsx` | Payee input with autocomplete suggestions |

### Settings & Management

| Component | File | Description |
|-----------|------|-------------|
| PayeeManagement | `PayeeManagement.tsx` | Full payee CRUD with merge/rename |
| TransactionRulesSettings | `TransactionRulesSettings.tsx` | Transaction rule management UI |
| ScheduledTransactions | `ScheduledTransactions.tsx` | Scheduled transaction list and management (full view on the Scheduled tab of the Transactions page, compact view on the dashboard) |

### Providers & System

| Component | File | Description |
|-----------|------|-------------|
| SettingsProvider | `SettingsProvider.tsx` | React Context provider for app settings (`useSettings`); sets the default display currency via `setDefaultCurrency()` |
| ProfileProvider | `ProfileProvider.tsx` | React Context provider for multi-profile management (`useProfile`); syncs the `loot-council-profile` cookie from `localStorage` on start-up |
| KeyboardShortcutsProvider | `KeyboardShortcutsProvider.tsx` | Global keyboard shortcuts and the shortcuts help dialog |
| ErrorBoundary | `ErrorBoundary.tsx` | Exports `AutoResetErrorBoundary`, which resets when the route changes |

### Feedback & Notifications

| Component | File | Description |
|-----------|------|-------------|
| Toast | `Toast.tsx` | `ToastProvider` and `useToast()` notifications |
| UndoToast | `UndoToast.tsx` | Floating undo/redo action bar |

---

## Design System Notes

- **No component library** — All components are custom-built
- **Styling:** Tailwind CSS 4 with CSS custom properties for theming
- **Modal pattern:** Fixed overlay (`z-50+`) with `ModalDialog` or the shared `useModalA11y` hook
- **Form pattern:** Controlled inputs with `useState`, async submit handlers
- **Icons:** Lucide React (consistent across all components)
- **Themes:** 7 CSS class-based themes applied to `<html>` element
  - `theme-finance` (default) — Clean professional finance look
  - `theme-dungeon` — Dark with gold accents
  - `theme-forest` — Green accents
  - `theme-ocean` — Blue accents
  - `theme-crimson` — Red/warm accents
  - `theme-royal` — Purple accents
  - `theme-kawaii` — Warm pink accents
- **Color tokens:** `text-gold`, `bg-background`, `bg-background-secondary`, `text-foreground`, `text-success`, `text-danger`, etc.

---

## Modal Accessibility

`ModalDialog` composes `useModalA11y(isOpen, onClose)` and supplies `role="dialog"`, `aria-modal="true"`, and a programmatically focusable container. While open, the hook:

- Moves focus to `[data-autofocus]`, the first focusable control, or the dialog itself
- Traps Tab and Shift+Tab within the topmost dialog
- Closes the topmost dialog on Escape
- Uses a reference-counted body scroll lock so closing one stacked dialog cannot unlock the page behind another
- Restores focus to the element that opened the dialog

Most modal components render `ModalDialog`; `TransactionForm` uses the hook directly because its dialog markup is integrated with the form.

---

## Component Dependencies

```
layout.tsx
└── ToastProvider
    └── ProfileProvider
        └── SettingsProvider
            └── UndoProvider (src/lib/useUndo.tsx)
                └── KeyboardShortcutsProvider
                    ├── Sidebar                  # Desktop nav + profile menu
                    ├── <main>
                    │   └── AutoResetErrorBoundary
                    │       └── page
                    ├── MobileNav                # Mobile bottom nav
                    └── UndoToast                # Floating undo bar

Page Components (each page)
├── Skeleton                   # Loading states
├── TransactionForm            # Shared transaction modal
├── ConfirmDialog              # Shared confirmation (useConfirmDialog)
├── useToast()                 # Notifications
└── [Feature-specific modals]  # Per-page modals
```
