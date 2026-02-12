'use client';

import { Settings as SettingsIcon, Upload, Download, Trash2, Database, Palette, Globe, Loader2, Key, RefreshCw, Link2, Zap } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useSettings } from '@/components/SettingsProvider';
import TransactionRulesSettings from '@/components/TransactionRulesSettings';
import PayeeManagement from '@/components/PayeeManagement';

interface YNABBudget {
  id: string;
  name: string;
  lastModified: string;
}

interface Integration {
  id: string;
  provider: string;
  apiKey: string | null;
  enabled: boolean;
  lastSynced: string | null;
}

export default function SettingsPage() {
  const { settings, loading, updateSettings } = useSettings();
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // YNAB API State - initialize from localStorage
  const [ynabToken, setYnabToken] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('ynab_token') || '';
    }
    return '';
  });
  const [ynabBudgets, setYnabBudgets] = useState<YNABBudget[]>([]);
  const [selectedBudget, setSelectedBudget] = useState<string>('');
  const [ynabLoading, setYnabLoading] = useState(false);
  const [ynabStatus, setYnabStatus] = useState<string | null>(null);

  // YNAB Delta Sync State
  const [syncStatus, setSyncStatus] = useState<{
    hasSynced: boolean;
    lastSync: string | null;
    budgetId: string | null;
  } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  // Binance Integration State
  const [binanceApiKey, setBinanceApiKey] = useState('');
  const [binanceApiSecret, setBinanceApiSecret] = useState('');
  const [binanceLoading, setBinanceLoading] = useState(false);
  const [binanceStatus, setBinanceStatus] = useState<string | null>(null);
  const [binanceIntegration, setBinanceIntegration] = useState<Integration | null>(null);

  const fetchIntegrations = async () => {
    try {
      const res = await fetch('/api/integrations');
      const data = await res.json();
      const binance = data.integrations?.find((i: Integration) => i.provider === 'binance');
      if (binance) {
        setBinanceIntegration(binance);
      }
    } catch (err) {
      console.error('Failed to load integrations:', err);
    }
  };

  // Load integrations on mount
  useEffect(() => {
    // Fetching data on mount and setting state is a legitimate pattern
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchIntegrations();
    fetchSyncStatus();
  }, []);

  const fetchSyncStatus = async () => {
    try {
      const res = await fetch('/api/import/ynab-api/sync');
      if (res.ok) {
        const data = await res.json();
        setSyncStatus(data);
      }
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  };

  const performDeltaSync = async () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('ynab_token') : null;
    if (!token) {
      setSyncResult('⚠️ YNAB token not found. Please re-enter your token below and connect first.');
      return;
    }

    setSyncing(true);
    setSyncResult('Syncing changes from YNAB...');

    try {
      const res = await fetch('/api/import/ynab-api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();

      if (res.ok) {
        const s = data.stats;
        const changes = [];
        if (s.accounts.created + s.accounts.updated + s.accounts.deleted > 0)
          changes.push(`Accounts: +${s.accounts.created} ~${s.accounts.updated} -${s.accounts.deleted}`);
        if (s.categories.created + s.categories.updated + s.categories.deleted > 0)
          changes.push(`Categories: +${s.categories.created} ~${s.categories.updated} -${s.categories.deleted}`);
        if (s.transactions.created + s.transactions.updated + s.transactions.deleted > 0)
          changes.push(`Transactions: +${s.transactions.created} ~${s.transactions.updated} -${s.transactions.deleted}`);
        if (s.payees.created + s.payees.updated + s.payees.deleted > 0)
          changes.push(`Payees: +${s.payees.created} ~${s.payees.updated} -${s.payees.deleted}`);
        if (s.monthlyBudgets > 0)
          changes.push(`Budget entries: ${s.monthlyBudgets}`);
        
        const summary = changes.length > 0 ? changes.join(' | ') : 'Everything up to date';
        setSyncResult(`✅ ${summary}`);
        fetchSyncStatus();
      } else {
        setSyncResult(`Error: ${data.error}${data.details ? ` - ${data.details}` : ''}`);
      }
    } catch {
      setSyncResult('Delta sync failed. Check your connection and try again.');
    }
    setSyncing(false);
  };

  const saveBinanceCredentials = async () => {
    if (!binanceApiKey || !binanceApiSecret) {
      setBinanceStatus('Please enter both API Key and Secret');
      return;
    }

    setBinanceLoading(true);
    setBinanceStatus('Saving...');

    try {
      const res = await fetch('/api/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: 'binance',
          apiKey: binanceApiKey,
          apiSecret: binanceApiSecret,
        }),
      });

      if (res.ok) {
        setBinanceStatus('✅ Binance credentials saved! Testing connection...');
        setBinanceApiKey('');
        setBinanceApiSecret('');
        fetchIntegrations();
        
        // Test connection
        const testRes = await fetch('/api/binance');
        const testData = await testRes.json();
        
        if (testRes.ok) {
          setBinanceStatus(`✅ Connected! Found ${testData.balances?.length || 0} assets with balance`);
        } else {
          setBinanceStatus(`⚠️ Saved but connection failed: ${testData.error}`);
        }
      } else {
        const data = await res.json();
        setBinanceStatus(`Error: ${data.error}`);
      }
    } catch {
      setBinanceStatus('Failed to save credentials');
    }
    setBinanceLoading(false);
  };

  const syncBinance = async () => {
    setBinanceLoading(true);
    setBinanceStatus('Syncing Binance holdings...');

    try {
      const res = await fetch('/api/binance', { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        setBinanceStatus(`✅ Synced! Created ${data.created}, Updated ${data.updated} assets`);
        fetchIntegrations();
      } else {
        setBinanceStatus(`Error: ${data.error}`);
      }
    } catch {
      setBinanceStatus('Sync failed');
    }
    setBinanceLoading(false);
  };

  const disconnectBinance = async () => {
    if (!confirm('Disconnect Binance? Your synced assets will remain.')) return;
    
    try {
      await fetch('/api/integrations?provider=binance', { method: 'DELETE' });
      setBinanceIntegration(null);
      setBinanceStatus(null);
    } catch {
      setBinanceStatus('Failed to disconnect');
    }
  };

  const fetchYNABBudgets = async () => {
    if (!ynabToken) {
      setYnabStatus('Please enter your YNAB API token');
      return;
    }

    setYnabLoading(true);
    setYnabStatus('Connecting to YNAB...');

    try {
      const res = await fetch(`/api/import/ynab-api?token=${encodeURIComponent(ynabToken)}`);
      const data = await res.json();

      if (res.ok) {
        setYnabBudgets(data.budgets);
        setYnabStatus(`Found ${data.budgets.length} budget(s)`);
        localStorage.setItem('ynab_token', ynabToken);
      } else {
        setYnabStatus(`Error: ${data.error}`);
      }
    } catch {
      setYnabStatus('Failed to connect to YNAB');
    }
    setYnabLoading(false);
  };

  const importFromYNAB = async () => {
    if (!selectedBudget) {
      setYnabStatus('Please select a budget to import');
      return;
    }

    setYnabLoading(true);
    setYnabStatus('Importing from YNAB... This may take a minute.');

    try {
      const res = await fetch('/api/import/ynab-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: ynabToken, budgetId: selectedBudget }),
      });
      const data = await res.json();

      if (res.ok) {
        setYnabStatus(
          `✅ Success! Imported ${data.accounts} accounts, ${data.categories} categories, ${data.transactions} transactions. Ready to Assign: $${data.toBeBudgeted.toFixed(2)}`
        );
        fetchSyncStatus(); // Refresh sync status so delta sync button appears
      } else {
        setYnabStatus(`Error: ${data.error}`);
      }
    } catch {
      setYnabStatus('Import failed');
    }
    setYnabLoading(false);
  };

  const handleYNABImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportStatus('Importing...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/import/ynab', {
        method: 'POST',
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        setImportStatus(`Success! Imported ${data.transactions} transactions, ${data.categories} categories.`);
      } else {
        setImportStatus('Import failed. Please check file format.');
      }
    } catch {
      setImportStatus('Import failed. Please try again.');
    }
  };

  const handleSettingChange = async (key: string, value: string | number) => {
    setSaving(true);
    await updateSettings({ [key]: value });
    setSaving(false);
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-gold animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 rounded-xl bg-gold/20 flex items-center justify-center">
          <SettingsIcon className="w-7 h-7 text-gold" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settings</h1>
          <p className="text-neutral">Configure your preferences</p>
        </div>
      </div>

      {/* General Settings */}
      <section className="card mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Globe className="w-5 h-5 text-gold" />
          General
          {saving && <Loader2 className="w-4 h-4 text-gold animate-spin" />}
        </h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-neutral mb-1">Budget Name</label>
            <input
              type="text"
              value={settings?.budgetName || ''}
              onChange={(e) => handleSettingChange('budgetName', e.target.value)}
              className="input max-w-md"
            />
          </div>
          <div>
            <label className="block text-sm text-neutral mb-1">Currency</label>
            <select
              value={settings?.currency || 'AUD'}
              onChange={(e) => handleSettingChange('currency', e.target.value)}
              className="input max-w-md"
            >
              <option value="AUD">AUD - Australian Dollar</option>
              <option value="USD">USD - US Dollar</option>
              <option value="GBP">GBP - British Pound</option>
              <option value="EUR">EUR - Euro</option>
            </select>
          </div>
        </div>
      </section>

      {/* Theme Settings */}
      <section className="card mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Palette className="w-5 h-5 text-gold" />
          Appearance
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <button
            onClick={() => handleSettingChange('theme', 'dungeon')}
            className={`p-4 rounded-xl border-2 transition-all group ${settings?.theme === 'dungeon'
                ? 'border-gold bg-gold/10 shadow-lg shadow-gold/10'
                : 'border-border hover:border-gold/50'
              }`}
          >
            <div className="w-full h-16 rounded-lg bg-gradient-to-br from-[#0a0a0f] via-[#12121a] to-[#1a1a25] mb-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#d4a846]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-[#d4a846]" />
            </div>
            <span className="text-sm font-semibold">Dungeon</span>
            <p className="text-xs text-neutral mt-1">Gold & Shadow</p>
          </button>
          <button
            onClick={() => handleSettingChange('theme', 'forest')}
            className={`p-4 rounded-xl border-2 transition-all group ${settings?.theme === 'forest'
                ? 'border-[#7cb342] bg-[#7cb342]/10 shadow-lg shadow-[#7cb342]/10'
                : 'border-border hover:border-[#7cb342]/50'
              }`}
          >
            <div className="w-full h-16 rounded-lg bg-gradient-to-br from-[#080f08] via-[#0f1a0f] to-[#152515] mb-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#7cb342]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-[#7cb342]" />
            </div>
            <span className="text-sm font-semibold">Forest</span>
            <p className="text-xs text-neutral mt-1">Emerald Grove</p>
          </button>
          <button
            onClick={() => handleSettingChange('theme', 'ocean')}
            className={`p-4 rounded-xl border-2 transition-all group ${settings?.theme === 'ocean'
                ? 'border-[#4fc3f7] bg-[#4fc3f7]/10 shadow-lg shadow-[#4fc3f7]/10'
                : 'border-border hover:border-[#4fc3f7]/50'
              }`}
          >
            <div className="w-full h-16 rounded-lg bg-gradient-to-br from-[#060d14] via-[#0a1520] to-[#122030] mb-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#4fc3f7]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-[#4fc3f7]" />
            </div>
            <span className="text-sm font-semibold">Ocean</span>
            <p className="text-xs text-neutral mt-1">Deep Sea</p>
          </button>
          <button
            onClick={() => handleSettingChange('theme', 'crimson')}
            className={`p-4 rounded-xl border-2 transition-all group ${settings?.theme === 'crimson'
                ? 'border-[#ef5350] bg-[#ef5350]/10 shadow-lg shadow-[#ef5350]/10'
                : 'border-border hover:border-[#ef5350]/50'
              }`}
          >
            <div className="w-full h-16 rounded-lg bg-gradient-to-br from-[#0f0808] via-[#1a0f0f] to-[#251515] mb-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#ef5350]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-[#ef5350]" />
            </div>
            <span className="text-sm font-semibold">Crimson</span>
            <p className="text-xs text-neutral mt-1">Blood Moon</p>
          </button>
          <button
            onClick={() => handleSettingChange('theme', 'royal')}
            className={`p-4 rounded-xl border-2 transition-all group ${settings?.theme === 'royal'
                ? 'border-[#ab47bc] bg-[#ab47bc]/10 shadow-lg shadow-[#ab47bc]/10'
                : 'border-border hover:border-[#ab47bc]/50'
              }`}
          >
            <div className="w-full h-16 rounded-lg bg-gradient-to-br from-[#0a080f] via-[#120f1a] to-[#1a1525] mb-3 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-[#ab47bc]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="absolute bottom-2 right-2 w-3 h-3 rounded-full bg-[#ab47bc]" />
            </div>
            <span className="text-sm font-semibold">Royal</span>
            <p className="text-xs text-neutral mt-1">Purple Reign</p>
          </button>
        </div>
      </section>

      {/* Exchange Integrations */}
      <section className="card mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Link2 className="w-5 h-5 text-gold" />
          Exchange Integrations
        </h2>

        {/* Binance */}
        <div className="p-4 bg-surface-light/30 rounded-lg border border-gold/20">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-gold flex items-center gap-2">
              <svg className="w-5 h-5" viewBox="0 0 126.61 126.61" fill="currentColor">
                <path d="M38.73 53.2L63.31 28.62l24.58 24.58 14.3-14.3L63.31 0 24.43 38.9zM0 63.31l14.3-14.3 14.3 14.3-14.3 14.3zM38.73 73.41l24.58 24.58 24.58-24.58 14.31 14.29-.01.01L63.31 126.61l-38.9-38.9.01-.01z"/>
                <path d="M98 63.31l14.3-14.3 14.31 14.3-14.31 14.3zM77.83 63.3L63.31 48.78 52.79 59.3l-1.21 1.21-2.8 2.8 14.53 14.52 14.52-14.52z"/>
              </svg>
              Binance
            </h3>
            {binanceIntegration && (
              <span className="text-xs bg-positive/20 text-positive px-2 py-1 rounded">Connected</span>
            )}
          </div>
          
          <p className="text-sm text-neutral mb-4">
            Create a <strong>read-only</strong> API key from{' '}
            <a
              href="https://www.binance.com/en/my/settings/api-management"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:underline"
            >
              Binance API Management
            </a>
            . Only enable &quot;Read&quot; permissions.
          </p>

          {binanceIntegration ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  onClick={syncBinance}
                  disabled={binanceLoading}
                  className="btn btn-primary"
                >
                  {binanceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Sync Holdings
                </button>
                <button
                  onClick={disconnectBinance}
                  className="btn btn-secondary text-danger"
                >
                  Disconnect
                </button>
              </div>
              {binanceIntegration.lastSynced && (
                <p className="text-xs text-neutral">
                  Last synced: {new Date(binanceIntegration.lastSynced).toLocaleString()}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={binanceApiKey}
                onChange={(e) => setBinanceApiKey(e.target.value)}
                placeholder="API Key"
                className="input w-full"
              />
              <input
                type="password"
                value={binanceApiSecret}
                onChange={(e) => setBinanceApiSecret(e.target.value)}
                placeholder="API Secret"
                className="input w-full"
              />
              <button
                onClick={saveBinanceCredentials}
                disabled={binanceLoading || !binanceApiKey || !binanceApiSecret}
                className="btn btn-primary"
              >
                {binanceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
                Connect Binance
              </button>
            </div>
          )}

          {binanceStatus && (
            <p className={`text-sm mt-3 ${binanceStatus.includes('✅') ? 'text-positive' : binanceStatus.includes('Error') || binanceStatus.includes('⚠️') ? 'text-danger' : 'text-neutral'}`}>
              {binanceStatus}
            </p>
          )}
        </div>
      </section>

      {/* Transaction Rules */}
      <TransactionRulesSettings />

      {/* Payee Management */}
      <PayeeManagement />

      {/* Import/Export */}
      <section className="card mb-6">
        <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
          <Database className="w-5 h-5 text-gold" />
          Data Management
        </h2>

        {/* YNAB Delta Sync */}
        {syncStatus?.hasSynced && (
          <div className="mb-6 p-4 bg-surface-light/30 rounded-lg border border-gold/20">
            <h3 className="font-medium text-gold mb-2 flex items-center gap-2">
              <Zap className="w-4 h-4" />
              YNAB Delta Sync
            </h3>
            <p className="text-sm text-neutral mb-3">
              Pull only the changes since your last sync — fast and efficient.
              {syncStatus.lastSync && (
                <> Last synced: <span className="text-foreground">{new Date(syncStatus.lastSync).toLocaleString()}</span></>
              )}
            </p>
            <div className="flex gap-2 items-center">
              <button
                onClick={performDeltaSync}
                disabled={syncing}
                className="btn btn-primary"
              >
                {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                Sync Now
              </button>
            </div>
            {syncResult && (
              <p className={`text-sm mt-3 ${syncResult.includes('✅') ? 'text-success' : syncResult.includes('Error') || syncResult.includes('⚠️') ? 'text-danger' : 'text-neutral'}`}>
                {syncResult}
              </p>
            )}
          </div>
        )}

        {/* YNAB API Import */}
        <div className="mb-6 p-4 bg-surface-light/30 rounded-lg border border-gold/20">
          <h3 className="font-medium text-gold mb-2 flex items-center gap-2">
            <Key className="w-4 h-4" />
            Import via YNAB API (Recommended)
          </h3>
          <p className="text-sm text-neutral mb-4">
            Get your Personal Access Token from{' '}
            <a
              href="https://app.ynab.com/settings/developer"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold hover:underline"
            >
              YNAB Developer Settings
            </a>
          </p>

          <div className="flex gap-2 mb-3">
            <input
              type="password"
              value={ynabToken}
              onChange={(e) => setYnabToken(e.target.value)}
              placeholder="Paste your YNAB API token here"
              className="input flex-1"
            />
            <button
              onClick={fetchYNABBudgets}
              disabled={ynabLoading}
              className="btn btn-secondary"
            >
              {ynabLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              Connect
            </button>
          </div>

          {ynabBudgets.length > 0 && (
            <div className="flex gap-2 mb-3">
              <select
                value={selectedBudget}
                onChange={(e) => setSelectedBudget(e.target.value)}
                className="input flex-1"
              >
                <option value="">Select a budget...</option>
                {ynabBudgets.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <button
                onClick={importFromYNAB}
                disabled={ynabLoading || !selectedBudget}
                className="btn btn-primary"
              >
                {ynabLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Import
              </button>
            </div>
          )}

          {ynabStatus && (
            <p className={`text-sm ${ynabStatus.includes('✅') ? 'text-success' : ynabStatus.includes('Error') ? 'text-danger' : 'text-neutral'}`}>
              {ynabStatus}
            </p>
          )}
        </div>

        {/* YNAB File Import (Fallback) */}
        <div className="mb-6">
          <h3 className="font-medium text-foreground mb-2">Import from YNAB File (Fallback)</h3>
          <p className="text-sm text-neutral mb-3">
            If you prefer, export your budget from YNAB (Settings → Export Budget) and upload the ZIP file.
          </p>
          <label className="btn btn-secondary cursor-pointer inline-flex">
            <Upload className="w-5 h-5" />
            Import YNAB Backup
            <input
              type="file"
              accept=".zip,.csv"
              onChange={handleYNABImport}
              className="hidden"
            />
          </label>
          {importStatus && (
            <p className={`text-sm mt-2 ${importStatus.includes('Success') ? 'text-success' : 'text-warning'}`}>
              {importStatus}
            </p>
          )}
        </div>

        {/* Export */}
        <div className="mb-6">
          <h3 className="font-medium text-foreground mb-2">Export Data</h3>
          <p className="text-sm text-neutral mb-3">
            Download all your data as a backup.
          </p>
          <button 
            onClick={async () => {
              try {
                const res = await fetch('/api/export');
                if (res.ok) {
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `loot-council-backup-${new Date().toISOString().split('T')[0]}.json`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } else {
                  alert('Failed to export data.');
                }
              } catch {
                alert('Export failed. Please try again.');
              }
            }}
            className="btn btn-secondary"
          >
            <Download className="w-5 h-5" />
            Export Backup
          </button>
        </div>

        {/* Restore from Backup */}
        <div className="mb-6">
          <h3 className="font-medium text-foreground mb-2">Restore from Backup</h3>
          <p className="text-sm text-neutral mb-3">
            Restore your data from a previously exported backup file. <strong className="text-warning">This will replace all current data.</strong>
          </p>
          <label className="btn btn-secondary cursor-pointer inline-flex">
            <Upload className="w-5 h-5" />
            Restore Backup
            <input
              type="file"
              accept=".json"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                
                if (!confirm('This will replace ALL current data with the backup. Are you sure you want to continue?')) {
                  e.target.value = '';
                  return;
                }
                
                try {
                  const text = await file.text();
                  const backup = JSON.parse(text);
                  
                  const res = await fetch('/api/import/backup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(backup),
                  });
                  
                  const data = await res.json();
                  
                  if (res.ok) {
                    alert(`Backup restored successfully!\n\nRestored from: ${data.restoredFrom}\nAccounts: ${data.stats.accounts}\nCategories: ${data.stats.categories}\nTransactions: ${data.stats.transactions}\nAssets: ${data.stats.assets}`);
                    window.location.reload();
                  } else {
                    alert(`Restore failed: ${data.error}`);
                  }
                } catch (err) {
                  alert('Failed to parse backup file. Make sure it is a valid Loot Council backup.');
                  console.error('Restore error:', err);
                }
                
                e.target.value = '';
              }}
              className="hidden"
            />
          </label>
        </div>

        {/* Danger Zone */}
        <div className="pt-4 border-t border-border">
          <h3 className="font-medium text-danger mb-2">Danger Zone</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-neutral mb-2">
                Clear all budget data (accounts, transactions, categories, payees) but <strong className="text-foreground">keep investments, assets, and integrations</strong>.
              </p>
              <button
                onClick={async () => {
                  if (confirm('Clear all budget data? Investments and integrations will be preserved. This cannot be undone.')) {
                    try {
                      const res = await fetch('/api/reset/budget', { method: 'DELETE' });
                      if (res.ok) {
                        alert('Budget data cleared. Investments preserved.');
                        window.location.href = '/';
                      } else {
                        alert('Failed to clear budget data.');
                      }
                    } catch {
                      alert('Error clearing budget data.');
                    }
                  }
                }}
                className="btn bg-warning/20 text-warning hover:bg-warning/30 border border-warning/30"
              >
                <Trash2 className="w-5 h-5" />
                Clear Budget Data
              </button>
            </div>
            <div>
              <p className="text-sm text-neutral mb-2">
                Permanently delete <strong className="text-danger">everything</strong> — budget, investments, integrations, all of it.
              </p>
              <button
                onClick={async () => {
                  if (confirm('Are you sure you want to delete ALL data? This cannot be undone.')) {
                    try {
                      const res = await fetch('/api/reset', { method: 'DELETE' });
                      if (res.ok) {
                        alert('All data has been reset.');
                        window.location.href = '/';
                      } else {
                        alert('Failed to reset data.');
                      }
                    } catch {
                      alert('Error resetting data.');
                    }
                  }
                }}
                className="btn bg-danger/20 text-danger hover:bg-danger/30 border border-danger/30"
              >
                <Trash2 className="w-5 h-5" />
                Delete All Data
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
