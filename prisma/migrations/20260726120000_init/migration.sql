-- CreateTable
CREATE TABLE "Profile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "onBudget" BOOLEAN NOT NULL DEFAULT true,
    "balance" INTEGER NOT NULL DEFAULT 0,
    "clearedBalance" INTEGER NOT NULL DEFAULT 0,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "lastReconciled" DATETIME,
    "linkedAccountId" TEXT,
    "ynabId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Account_linkedAccountId_fkey" FOREIGN KEY ("linkedAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CategoryGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "ynabId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CategoryGroup_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "goalType" TEXT,
    "goalTarget" INTEGER,
    "goalDueDate" DATETIME,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "ynabId" TEXT,
    "rolloverType" TEXT NOT NULL DEFAULT 'available',
    "rolloverCap" INTEGER,
    "goalPercentageComplete" INTEGER,
    "goalUnderFunded" INTEGER,
    "goalOverallFunded" INTEGER,
    "goalOverallLeft" INTEGER,
    "goalCadence" INTEGER,
    "goalCadenceFrequency" INTEGER,
    "goalDay" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CategoryGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MonthlyBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "month" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assigned" INTEGER NOT NULL DEFAULT 0,
    "activity" INTEGER NOT NULL DEFAULT 0,
    "available" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MonthlyBudget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "amount" INTEGER NOT NULL,
    "payee" TEXT,
    "memo" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN NOT NULL DEFAULT true,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "isSplit" BOOLEAN NOT NULL DEFAULT false,
    "transferId" TEXT,
    "ynabId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SubTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "categoryId" TEXT,
    "amount" INTEGER NOT NULL,
    "memo" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SubTransaction_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SubTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payee" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "ynabId" TEXT,
    "transferAccountId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payee_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "amount" INTEGER NOT NULL,
    "date" DATETIME NOT NULL,
    "memo" TEXT,
    "sourceAccountId" TEXT NOT NULL,
    "destinationAccountId" TEXT NOT NULL,
    "sourceTransactionId" TEXT,
    "destTransactionId" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Transfer_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "symbol" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetClass" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "quantity" REAL NOT NULL DEFAULT 1,
    "costBasis" INTEGER NOT NULL DEFAULT 0,
    "currentPrice" INTEGER NOT NULL DEFAULT 0,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "annualDividend" INTEGER NOT NULL DEFAULT 0,
    "dividendYield" REAL NOT NULL DEFAULT 0,
    "stakingYield" REAL NOT NULL DEFAULT 0,
    "profileId" TEXT,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Asset_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AssetLot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetId" TEXT NOT NULL,
    "purchaseDate" DATETIME NOT NULL,
    "units" REAL NOT NULL,
    "unitPrice" INTEGER NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "brokerage" INTEGER NOT NULL DEFAULT 0,
    "soldUnits" REAL NOT NULL DEFAULT 0,
    "soldDate" DATETIME,
    "salePrice" INTEGER,
    "saleTotal" INTEGER,
    "capitalGain" INTEGER,
    "cgtDiscount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AssetLot_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AllocationTarget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "assetClass" TEXT NOT NULL,
    "targetPct" REAL NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AllocationTarget_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "FireSettings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "yearOfBirth" INTEGER NOT NULL DEFAULT 1990,
    "retirementAge" INTEGER NOT NULL DEFAULT 60,
    "preservationAge" INTEGER NOT NULL DEFAULT 60,
    "annualExpenses" INTEGER NOT NULL DEFAULT 0,
    "withdrawalRate" REAL NOT NULL DEFAULT 0.04,
    "inflationRate" REAL NOT NULL DEFAULT 0.025,
    "expectedReturn" REAL NOT NULL DEFAULT 0.07,
    "annualSuperContrib" INTEGER NOT NULL DEFAULT 0,
    "employerContribRate" REAL NOT NULL DEFAULT 0.115,
    "fireNumber" INTEGER NOT NULL DEFAULT 0,
    "coastFireNumber" INTEGER NOT NULL DEFAULT 0,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FireSettings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "lastUpdated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "budgetName" TEXT NOT NULL DEFAULT 'My Budget',
    "currency" TEXT NOT NULL DEFAULT 'AUD',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "startOfWeek" INTEGER NOT NULL DEFAULT 1,
    "theme" TEXT NOT NULL DEFAULT 'finance',
    "toBeBudgeted" INTEGER NOT NULL DEFAULT 0,
    "lastYnabSync" DATETIME,
    "ynabBudgetId" TEXT,
    "ynabServerKnowledge" INTEGER NOT NULL DEFAULT 0,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Settings_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ApiIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSynced" DATETIME,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ApiIntegration_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ScheduledTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "payee" TEXT,
    "memo" TEXT,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,
    "frequency" TEXT NOT NULL,
    "nextDueDate" DATETIME NOT NULL,
    "dayOfMonth" INTEGER,
    "dayOfWeek" INTEGER,
    "endDate" DATETIME,
    "autoCreate" BOOLEAN NOT NULL DEFAULT false,
    "reminderDays" INTEGER NOT NULL DEFAULT 3,
    "lastCreated" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledTransaction_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransactionRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "matchField" TEXT NOT NULL,
    "matchType" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "categoryId" TEXT,
    "payeeRename" TEXT,
    "memoTemplate" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TransactionRule_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "profileId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BudgetTemplate_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "Profile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BudgetTemplateItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "templateId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BudgetTemplateItem_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "BudgetTemplate" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Account_linkedAccountId_idx" ON "Account"("linkedAccountId");

-- CreateIndex
CREATE INDEX "Account_closed_idx" ON "Account"("closed");

-- CreateIndex
CREATE INDEX "Account_profileId_idx" ON "Account"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_profileId_ynabId_key" ON "Account"("profileId", "ynabId");

-- CreateIndex
CREATE INDEX "CategoryGroup_profileId_idx" ON "CategoryGroup"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "CategoryGroup_profileId_ynabId_key" ON "CategoryGroup"("profileId", "ynabId");

-- CreateIndex
CREATE INDEX "Category_groupId_idx" ON "Category"("groupId");

-- CreateIndex
CREATE INDEX "Category_ynabId_idx" ON "Category"("ynabId");

-- CreateIndex
CREATE INDEX "MonthlyBudget_month_idx" ON "MonthlyBudget"("month");

-- CreateIndex
CREATE INDEX "MonthlyBudget_categoryId_idx" ON "MonthlyBudget"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "MonthlyBudget_month_categoryId_key" ON "MonthlyBudget"("month", "categoryId");

-- CreateIndex
CREATE INDEX "Transaction_accountId_idx" ON "Transaction"("accountId");

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_transferId_idx" ON "Transaction"("transferId");

-- CreateIndex
CREATE INDEX "Transaction_ynabId_idx" ON "Transaction"("ynabId");

-- CreateIndex
CREATE INDEX "SubTransaction_transactionId_idx" ON "SubTransaction"("transactionId");

-- CreateIndex
CREATE INDEX "SubTransaction_categoryId_idx" ON "SubTransaction"("categoryId");

-- CreateIndex
CREATE INDEX "Payee_profileId_idx" ON "Payee"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "Payee_profileId_name_key" ON "Payee"("profileId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Payee_profileId_ynabId_key" ON "Payee"("profileId", "ynabId");

-- CreateIndex
CREATE INDEX "Transfer_profileId_idx" ON "Transfer"("profileId");

-- CreateIndex
CREATE INDEX "Asset_profileId_idx" ON "Asset"("profileId");

-- CreateIndex
CREATE INDEX "AssetLot_assetId_idx" ON "AssetLot"("assetId");

-- CreateIndex
CREATE INDEX "AllocationTarget_profileId_idx" ON "AllocationTarget"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "AllocationTarget_profileId_assetClass_key" ON "AllocationTarget"("profileId", "assetClass");

-- CreateIndex
CREATE INDEX "FireSettings_profileId_idx" ON "FireSettings"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_fromCurrency_toCurrency_key" ON "ExchangeRate"("fromCurrency", "toCurrency");

-- CreateIndex
CREATE INDEX "Settings_profileId_idx" ON "Settings"("profileId");

-- CreateIndex
CREATE INDEX "ApiIntegration_profileId_idx" ON "ApiIntegration"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiIntegration_provider_profileId_key" ON "ApiIntegration"("provider", "profileId");

-- CreateIndex
CREATE INDEX "ScheduledTransaction_profileId_idx" ON "ScheduledTransaction"("profileId");

-- CreateIndex
CREATE INDEX "TransactionRule_profileId_idx" ON "TransactionRule"("profileId");

-- CreateIndex
CREATE INDEX "BudgetTemplate_profileId_idx" ON "BudgetTemplate"("profileId");

-- CreateIndex
CREATE INDEX "BudgetTemplateItem_templateId_idx" ON "BudgetTemplateItem"("templateId");

