'use client';

import { X, TrendingUp, Search, Loader2, Wallet } from 'lucide-react';
import { useState, useCallback } from 'react';

interface AddAssetModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: () => void;
}

interface QuotePreview {
    symbol: string;
    name: string;
    price: number;
    assetClass: string;
    currency: string;
}

type AssetMode = 'tracked' | 'manual';

export default function AddAssetModal({ isOpen, onClose, onSave }: AddAssetModalProps) {
    const [mode, setMode] = useState<AssetMode>('tracked');
    const [symbol, setSymbol] = useState('');
    const [name, setName] = useState('');
    const [currentValue, setCurrentValue] = useState('');
    const [quantity, setQuantity] = useState('');
    const [costBasis, setCostBasis] = useState('');
    const [saving, setSaving] = useState(false);
    const [looking, setLooking] = useState(false);
    const [error, setError] = useState('');
    const [preview, setPreview] = useState<QuotePreview | null>(null);

    const lookupSymbol = useCallback(async (sym: string) => {
        if (!sym.trim()) {
            setPreview(null);
            return;
        }

        setLooking(true);
        setError('');
        
        try {
            const res = await fetch(`/api/quote?symbol=${sym.trim().toUpperCase()}`);
            if (res.ok) {
                const data = await res.json();
                setPreview({
                    symbol: data.symbol,
                    name: data.name,
                    price: data.price,
                    assetClass: data.assetClass,
                    currency: data.currency,
                });
            } else {
                setPreview(null);
                setError('Symbol not found. Try manual entry instead.');
            }
        } catch {
            setPreview(null);
        } finally {
            setLooking(false);
        }
    }, []);

    if (!isOpen) return null;

    async function handleLookup() {
        await lookupSymbol(symbol);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError('');

        if (mode === 'tracked') {
            if (!symbol.trim()) {
                setError('Symbol is required');
                return;
            }
            const qty = parseFloat(quantity) || 0;
            if (qty <= 0) {
                setError('Quantity is required');
                return;
            }
        } else {
            if (!name.trim()) {
                setError('Name is required');
                return;
            }
            const value = parseFloat(currentValue) || 0;
            if (value <= 0) {
                setError('Current value is required');
                return;
            }
        }

        setSaving(true);
        try {
            const body = mode === 'tracked' 
                ? {
                    symbol: symbol.trim().toUpperCase(),
                    quantity: parseFloat(quantity) || 0,
                    costBasis: parseFloat(costBasis) || (preview ? preview.price * parseFloat(quantity) : 0),
                    isManual: false,
                }
                : {
                    name: name.trim(),
                    currentPrice: parseFloat(currentValue) || 0,
                    costBasis: parseFloat(costBasis) || parseFloat(currentValue) || 0,
                    currency: 'AUD',
                    assetClass: 'other',
                    isManual: true,
                };

            const res = await fetch('/api/assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Failed to add asset');
            }

            // Reset form and close
            resetForm();
            onSave();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to add asset');
        } finally {
            setSaving(false);
        }
    }

    function resetForm() {
        setSymbol('');
        setName('');
        setQuantity('');
        setCostBasis('');
        setCurrentValue('');
        setPreview(null);
        setError('');
    }

    function handleClose() {
        resetForm();
        onClose();
    }

    function switchMode(newMode: AssetMode) {
        resetForm();
        setMode(newMode);
    }

    const totalValue = preview && quantity ? preview.price * parseFloat(quantity) : 0;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
            <div className="relative bg-background-secondary border border-border rounded-xl shadow-xl w-full max-w-md mx-4 animate-fade-in">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                            <TrendingUp className="w-5 h-5 text-gold" />
                        </div>
                        <h2 className="text-lg font-semibold text-foreground">Add Asset</h2>
                    </div>
                    <button onClick={handleClose} className="p-2 hover:bg-background-tertiary rounded-lg">
                        <X className="w-5 h-5 text-neutral" />
                    </button>
                </div>

                {/* Mode Toggle */}
                <div className="p-4 pb-0">
                    <div className="flex gap-2 p-1 bg-background rounded-lg">
                        <button
                            type="button"
                            onClick={() => switchMode('tracked')}
                            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                mode === 'tracked' 
                                    ? 'bg-gold/20 text-gold' 
                                    : 'text-neutral hover:text-foreground'
                            }`}
                        >
                            <TrendingUp className="w-4 h-4 inline mr-1.5" />
                            Tracked Stock
                        </button>
                        <button
                            type="button"
                            onClick={() => switchMode('manual')}
                            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                                mode === 'manual' 
                                    ? 'bg-gold/20 text-gold' 
                                    : 'text-neutral hover:text-foreground'
                            }`}
                        >
                            <Wallet className="w-4 h-4 inline mr-1.5" />
                            Manual Entry
                        </button>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                    {error && (
                        <div className="p-3 bg-danger/20 border border-danger/30 rounded-lg text-danger text-sm">
                            {error}
                        </div>
                    )}

                    {mode === 'tracked' ? (
                        <>
                            {/* Symbol Lookup */}
                            <div>
                                <label className="block text-sm font-medium text-neutral mb-1">
                                    Ticker Symbol
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={symbol}
                                        onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                                        onBlur={() => symbol && lookupSymbol(symbol)}
                                        placeholder="MSFT, AAPL, BTC-USD..."
                                        className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-neutral focus:outline-none focus:ring-2 focus:ring-gold/50"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleLookup}
                                        disabled={looking || !symbol}
                                        className="btn btn-secondary px-3"
                                    >
                                        {looking ? (
                                            <Loader2 className="w-5 h-5 animate-spin" />
                                        ) : (
                                            <Search className="w-5 h-5" />
                                        )}
                                    </button>
                                </div>
                                <p className="text-xs text-neutral mt-1">
                                    Enter a stock ticker, ETF, or crypto symbol
                                </p>
                            </div>

                            {/* Preview Card */}
                            {preview && (
                                <div className="p-3 bg-background rounded-lg border border-gold/30">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-semibold text-foreground">{preview.symbol}</p>
                                            <p className="text-sm text-neutral">{preview.name}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-gold">
                                                ${preview.price.toFixed(2)}
                                            </p>
                                            <p className="text-xs text-neutral">{preview.currency}</p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">
                                        Quantity *
                                    </label>
                                    <input
                                        type="number"
                                        value={quantity}
                                        onChange={(e) => setQuantity(e.target.value)}
                                        placeholder="10"
                                        step="any"
                                        min="0"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-neutral focus:outline-none focus:ring-2 focus:ring-gold/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">
                                        Cost Basis ($)
                                    </label>
                                    <input
                                        type="number"
                                        value={costBasis}
                                        onChange={(e) => setCostBasis(e.target.value)}
                                        placeholder={totalValue ? totalValue.toFixed(2) : 'Total paid'}
                                        step="0.01"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-neutral focus:outline-none focus:ring-2 focus:ring-gold/50"
                                    />
                                </div>
                            </div>

                            {totalValue > 0 && (
                                <p className="text-sm text-neutral">
                                    Current value: <span className="text-gold font-medium">${totalValue.toFixed(2)}</span>
                                </p>
                            )}
                        </>
                    ) : (
                        <>
                            {/* Manual Entry */}
                            <div>
                                <label className="block text-sm font-medium text-neutral mb-1">
                                    Asset Name *
                                </label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    placeholder="Raiz, Super, Property..."
                                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-neutral focus:outline-none focus:ring-2 focus:ring-gold/50"
                                />
                                <p className="text-xs text-neutral mt-1">
                                    For investments without a ticker (robo-advisors, super, property)
                                </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">
                                        Current Value *
                                    </label>
                                    <input
                                        type="number"
                                        value={currentValue}
                                        onChange={(e) => setCurrentValue(e.target.value)}
                                        placeholder="5000"
                                        step="0.01"
                                        min="0"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-neutral focus:outline-none focus:ring-2 focus:ring-gold/50"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-neutral mb-1">
                                        Total Invested
                                    </label>
                                    <input
                                        type="number"
                                        value={costBasis}
                                        onChange={(e) => setCostBasis(e.target.value)}
                                        placeholder={currentValue || 'Optional'}
                                        step="0.01"
                                        className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder:text-neutral focus:outline-none focus:ring-2 focus:ring-gold/50"
                                    />
                                </div>
                            </div>

                            <p className="text-xs text-neutral bg-background/50 p-2 rounded">
                                💡 Manual assets won&apos;t auto-update. Edit them from the Investments page when values change.
                            </p>
                        </>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={handleClose}
                            className="px-4 py-2 text-neutral hover:text-foreground transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving || (mode === 'tracked' ? !symbol || !quantity : !name || !currentValue)}
                            className="btn btn-primary"
                        >
                            {saving ? 'Adding...' : 'Add Asset'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
