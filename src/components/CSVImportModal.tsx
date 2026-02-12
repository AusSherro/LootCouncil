'use client';

import { useState, useRef, useCallback } from 'react';
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle, Loader2, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

interface Account {
    id: string;
    name: string;
}

interface ParsedTransaction {
    date: string;
    amount: number;
    payee: string;
    memo: string;
}

interface PreviewData {
    headers: string[];
    sampleRows: Record<string, string>[];
    totalRows: number;
    detectedFormat: string;
    parsedTransactions: ParsedTransaction[];
}

interface ImportResult {
    success: boolean;
    imported: number;
    duplicates: number;
    total: number;
}

interface CSVImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess?: () => void;
    accounts: Account[];
}

export default function CSVImportModal({ isOpen, onClose, onSuccess, accounts }: CSVImportModalProps) {
    const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'result'>('upload');
    const [selectedFile, setSelectedFile] = useState<File | null>(null);
    const [selectedAccountId, setSelectedAccountId] = useState('');
    const [preview, setPreview] = useState<PreviewData | null>(null);
    const [result, setResult] = useState<ImportResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === 'dragenter' || e.type === 'dragover') {
            setDragActive(true);
        } else if (e.type === 'dragleave') {
            setDragActive(false);
        }
    }, []);

    const handleFile = async (file: File) => {
        if (!file.name.endsWith('.csv')) {
            setError('Please upload a CSV file');
            return;
        }

        setSelectedFile(file);
        setError(null);

        // Get preview
        const formData = new FormData();
        formData.append('file', file);
        formData.append('action', 'preview');

        try {
            const res = await fetch('/api/import/csv', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to parse CSV');
                return;
            }

            setPreview(data);
            setStep('preview');
        } catch (err) {
            console.error('Preview error:', err);
            setError('Failed to parse CSV file');
        }
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFile(e.dataTransfer.files[0]);
        }
    }, []);

    const handleImport = async () => {
        if (!selectedFile || !selectedAccountId) {
            setError('Please select an account');
            return;
        }

        setStep('importing');
        setError(null);

        const formData = new FormData();
        formData.append('file', selectedFile);
        formData.append('accountId', selectedAccountId);
        formData.append('action', 'import');

        try {
            const res = await fetch('/api/import/csv', {
                method: 'POST',
                body: formData,
            });

            const data = await res.json();

            if (!res.ok) {
                setError(data.error || 'Failed to import transactions');
                setStep('preview');
                return;
            }

            setResult(data);
            setStep('result');
            onSuccess?.();
        } catch (err) {
            console.error('Import error:', err);
            setError('Failed to import transactions');
            setStep('preview');
        }
    };

    const handleClose = () => {
        setStep('upload');
        setSelectedFile(null);
        setSelectedAccountId('');
        setPreview(null);
        setResult(null);
        setError(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[70] animate-fade-in" onClick={handleClose}>
            <div className="bg-background-secondary border border-border rounded-xl w-full max-w-2xl mx-4 p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gold/20 flex items-center justify-center">
                            <FileSpreadsheet className="w-5 h-5 text-gold" />
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-foreground">Import Bank CSV</h2>
                            <p className="text-sm text-neutral">
                                {step === 'upload' && 'Upload your bank statement CSV file'}
                                {step === 'preview' && 'Review detected transactions'}
                                {step === 'importing' && 'Importing transactions...'}
                                {step === 'result' && 'Import complete'}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="text-neutral hover:text-foreground">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 flex items-center gap-2 text-danger">
                        <AlertCircle className="w-5 h-5" />
                        {error}
                    </div>
                )}

                {/* Step: Upload */}
                {step === 'upload' && (
                    <div
                        className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
                            dragActive ? 'border-gold bg-gold/5' : 'border-border hover:border-gold/50'
                        }`}
                        onDragEnter={handleDrag}
                        onDragLeave={handleDrag}
                        onDragOver={handleDrag}
                        onDrop={handleDrop}
                    >
                        <Upload className="w-12 h-12 text-neutral mx-auto mb-4" />
                        <p className="text-foreground mb-2">Drag & drop your CSV file here</p>
                        <p className="text-neutral text-sm mb-4">or</p>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                            className="hidden"
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="btn btn-primary"
                        >
                            Browse Files
                        </button>
                        <p className="text-neutral text-xs mt-4">
                            Supports ANZ, CommBank, NAB, Westpac, and generic CSV formats
                        </p>
                    </div>
                )}

                {/* Step: Preview */}
                {step === 'preview' && preview && (
                    <div className="space-y-4">
                        {/* File Info */}
                        <div className="p-3 rounded-lg bg-background flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <FileSpreadsheet className="w-5 h-5 text-gold" />
                                <div>
                                    <p className="font-medium text-foreground">{selectedFile?.name}</p>
                                    <p className="text-sm text-neutral">
                                        {preview.totalRows} rows · Format: {preview.detectedFormat}
                                    </p>
                                </div>
                            </div>
                            <button
                                onClick={() => { setStep('upload'); setSelectedFile(null); setPreview(null); }}
                                className="text-neutral hover:text-foreground text-sm"
                            >
                                Change file
                            </button>
                        </div>

                        {/* Account Selection */}
                        <div>
                            <label className="block text-sm text-neutral mb-1">Import to Account *</label>
                            <select
                                value={selectedAccountId}
                                onChange={e => setSelectedAccountId(e.target.value)}
                                className="input w-full"
                                required
                            >
                                <option value="">Select account...</option>
                                {accounts.map(a => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>

                        {/* Transaction Preview */}
                        <div>
                            <h3 className="font-medium text-foreground mb-2">
                                Preview ({preview.parsedTransactions.length} of {preview.totalRows})
                            </h3>
                            <div className="max-h-48 overflow-y-auto rounded-lg border border-border">
                                {preview.parsedTransactions.map((t, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 border-b border-border last:border-0 text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="text-neutral">{new Date(t.date).toLocaleDateString()}</span>
                                            <span className="text-foreground">{t.payee}</span>
                                        </div>
                                        <span className={`font-medium ${t.amount < 0 ? 'text-foreground' : 'text-success'}`}>
                                            {formatCurrency(t.amount)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-2">
                            <button onClick={handleClose} className="btn btn-secondary flex-1">
                                Cancel
                            </button>
                            <button 
                                onClick={handleImport} 
                                disabled={!selectedAccountId}
                                className="btn btn-primary flex-1"
                            >
                                Import {preview.totalRows} Transactions
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}

                {/* Step: Importing */}
                {step === 'importing' && (
                    <div className="text-center py-8">
                        <Loader2 className="w-12 h-12 text-gold mx-auto animate-spin mb-4" />
                        <p className="text-foreground">Importing transactions...</p>
                        <p className="text-sm text-neutral mt-1">This may take a moment</p>
                    </div>
                )}

                {/* Step: Result */}
                {step === 'result' && result && (
                    <div className="text-center py-8">
                        <div className="w-16 h-16 rounded-full bg-success/20 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="w-8 h-8 text-success" />
                        </div>
                        <h3 className="text-xl font-semibold text-foreground mb-2">Import Complete!</h3>
                        <div className="space-y-1 text-neutral mb-6">
                            <p><span className="text-success font-medium">{result.imported}</span> transactions imported</p>
                            {result.duplicates > 0 && (
                                <p><span className="text-warning font-medium">{result.duplicates}</span> duplicates skipped</p>
                            )}
                        </div>
                        <button onClick={handleClose} className="btn btn-primary">
                            Done
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
