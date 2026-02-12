'use client';

import { useState, useEffect, useRef } from 'react';
import { 
    Sparkles, Send, Loader2, MessageCircle, Lightbulb, 
    TrendingUp, Bot, User, RefreshCw,
    AlertTriangle, CheckCircle, ArrowUpRight, ArrowDownRight
} from 'lucide-react';

interface ChatMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface Insight {
    type: 'warning' | 'success' | 'tip' | 'trend';
    title: string;
    description: string;
    emoji: string;
}

interface Recommendation {
    categoryName: string;
    currentAmount: number;
    suggestedAmount: number;
    reasoning: string;
}

export default function AssistantPage() {
    const [activeTab, setActiveTab] = useState<'chat' | 'insights' | 'optimize'>('chat');
    
    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([
        {
            role: 'assistant',
            content: "Hello! I'm your financial assistant. Ask me anything about your spending, savings goals, or budget optimisation. I'm here to help you make smarter financial decisions.",
            timestamp: new Date(),
        },
    ]);
    const [input, setInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Insights state
    const [insights, setInsights] = useState<Insight[]>([]);
    const [insightsLoading, setInsightsLoading] = useState(false);
    const [insightsSummary, setInsightsSummary] = useState<{
        totalSpent: number;
        totalIncome: number;
        savingsRate: number;
    } | null>(null);

    // Optimizer state
    const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
    const [optimizeLoading, setOptimizeLoading] = useState(false);
    const [applyingOptimizations, setApplyingOptimizations] = useState(false);
    const [optimizeSummary, setOptimizeSummary] = useState<{
        totalIncome: number;
        currentBudgeted: number;
        potentialSavings: number;
    } | null>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const sendMessage = async () => {
        if (!input.trim() || chatLoading) return;

        const userMessage: ChatMessage = {
            role: 'user',
            content: input.trim(),
            timestamp: new Date(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setChatLoading(true);

        try {
            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMessage.content }),
            });

            const data = await res.json();

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: data.response || 'No response received. Please try again.',
                timestamp: new Date(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch {
            setMessages(prev => [...prev, {
                role: 'assistant',
                content: 'Something went wrong. Please try again.',
                timestamp: new Date(),
            }]);
        } finally {
            setChatLoading(false);
        }
    };

    const fetchInsights = async () => {
        setInsightsLoading(true);
        try {
            const res = await fetch('/api/ai/insights');
            const data = await res.json();
            setInsights(data.insights || []);
            setInsightsSummary(data.summary);
        } catch {
            console.error('Failed to fetch insights');
        } finally {
            setInsightsLoading(false);
        }
    };

    const fetchOptimizations = async () => {
        setOptimizeLoading(true);
        try {
            const res = await fetch('/api/ai/optimize');
            const data = await res.json();
            setRecommendations(data.recommendations || []);
            setOptimizeSummary(data.summary);
        } catch {
            console.error('Failed to fetch optimizations');
        } finally {
            setOptimizeLoading(false);
        }
    };

    const applyOptimizations = async () => {
        if (recommendations.length === 0 || applyingOptimizations) return;
        
        setApplyingOptimizations(true);
        try {
            const res = await fetch('/api/ai/optimize', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ recommendations }),
            });
            
            const data = await res.json();
            
            if (res.ok) {
                // Clear recommendations and show success in chat
                setRecommendations([]);
                setOptimizeSummary(null);
                setMessages(prev => [...prev, {
                    role: 'assistant',
                    content: `Successfully applied ${data.updated} budget optimizations. Your category allocations have been updated.`,
                    timestamp: new Date(),
                }]);
                setActiveTab('chat');
            } else {
                console.error('Failed to apply optimizations:', data.error);
            }
        } catch (err) {
            console.error('Failed to apply optimizations:', err);
        } finally {
            setApplyingOptimizations(false);
        }
    };

    // Load data when switching tabs
    useEffect(() => {
        if (activeTab === 'insights' && insights.length === 0) {
            fetchInsights();
        } else if (activeTab === 'optimize' && recommendations.length === 0) {
            fetchOptimizations();
        }
    }, [activeTab, insights.length, recommendations.length]);

    const getInsightIcon = (type: string) => {
        switch (type) {
            case 'warning': return <AlertTriangle className="w-5 h-5 text-orange-400" />;
            case 'success': return <CheckCircle className="w-5 h-5 text-success" />;
            case 'tip': return <Lightbulb className="w-5 h-5 text-gold" />;
            case 'trend': return <TrendingUp className="w-5 h-5 text-blue-400" />;
            default: return <Sparkles className="w-5 h-5 text-gold" />;
        }
    };

    const tabs = [
        { id: 'chat', icon: MessageCircle, label: 'Chat' },
        { id: 'insights', icon: Lightbulb, label: 'Insights' },
        { id: 'optimize', icon: TrendingUp, label: 'Optimize' },
    ];

    return (
        <div className="p-6 lg:p-8 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                    <h1 className="text-2xl font-semibold text-foreground">Assistant</h1>
                    <p className="text-sm text-neutral">AI-powered financial insights</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 mb-6 p-1 bg-background-tertiary rounded-lg">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as typeof activeTab)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors flex-1 justify-center text-sm ${
                            activeTab === tab.id
                                ? 'bg-primary text-primary-foreground'
                                : 'text-neutral hover:text-foreground hover:bg-background-secondary'
                        }`}
                    >
                        <tab.icon className="w-4 h-4" />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0">
                {/* Chat Tab */}
                {activeTab === 'chat' && (
                    <div className="card h-full flex flex-col">
                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto space-y-4 mb-4 pr-2">
                            {messages.map((msg, i) => (
                                <div
                                    key={i}
                                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                        msg.role === 'assistant' 
                                            ? 'bg-gradient-to-br from-purple-500 to-pink-500' 
                                            : 'bg-gold'
                                    }`}>
                                        {msg.role === 'assistant' ? (
                                            <Bot className="w-5 h-5 text-white" />
                                        ) : (
                                            <User className="w-5 h-5 text-background" />
                                        )}
                                    </div>
                                    <div className={`max-w-[75%] rounded-2xl px-4 py-3 ${
                                        msg.role === 'assistant'
                                            ? 'bg-background-tertiary text-foreground'
                                            : 'bg-gold text-background'
                                    }`}>
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                            {chatLoading && (
                                <div className="flex gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                        <Bot className="w-5 h-5 text-white" />
                                    </div>
                                    <div className="bg-background-tertiary rounded-2xl px-4 py-3">
                                        <div className="flex items-center gap-2 text-neutral">
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Thinking...
                                        </div>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>

                        {/* Input */}
                        <div className="flex gap-3">
                            <input
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                                placeholder="Ask about your finances..."
                                className="input flex-1"
                                disabled={chatLoading}
                            />
                            <button
                                onClick={sendMessage}
                                disabled={chatLoading || !input.trim()}
                                className="btn btn-primary px-6"
                            >
                                {chatLoading ? (
                                    <Loader2 className="w-5 h-5 animate-spin" />
                                ) : (
                                    <Send className="w-5 h-5" />
                                )}
                            </button>
                        </div>

                        {/* Quick prompts */}
                        <div className="flex flex-wrap gap-2 mt-3">
                            {[
                                "How am I doing this month?",
                                "Where can I cut spending?",
                                "Tips for saving more?",
                            ].map(prompt => (
                                <button
                                    key={prompt}
                                    onClick={() => setInput(prompt)}
                                    className="text-sm px-3 py-1.5 rounded-full bg-background-tertiary text-neutral hover:text-foreground hover:bg-background transition-all"
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Insights Tab */}
                {activeTab === 'insights' && (
                    <div className="space-y-4">
                        {/* Summary Card */}
                        {insightsSummary && (
                            <div className="card bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-500/20">
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="text-center">
                                        <p className="text-sm text-neutral mb-1">This Month&apos;s Income</p>
                                        <p className="text-2xl font-bold text-success">
                                            ${(insightsSummary.totalIncome / 100).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-neutral mb-1">This Month&apos;s Spending</p>
                                        <p className="text-2xl font-bold text-error">
                                            ${(insightsSummary.totalSpent / 100).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-neutral mb-1">Savings Rate</p>
                                        <p className={`text-2xl font-bold ${insightsSummary.savingsRate > 0.2 ? 'text-success' : 'text-gold'}`}>
                                            {(insightsSummary.savingsRate * 100).toFixed(1)}%
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Refresh Button */}
                        <div className="flex justify-end">
                            <button
                                onClick={fetchInsights}
                                disabled={insightsLoading}
                                className="btn text-sm"
                            >
                                <RefreshCw className={`w-4 h-4 ${insightsLoading ? 'animate-spin' : ''}`} />
                                Refresh Insights
                            </button>
                        </div>

                        {/* Insights Grid */}
                        {insightsLoading ? (
                            <div className="card text-center py-12">
                                <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto mb-4" />
                                <p className="text-neutral">Analyzing your spending patterns...</p>
                            </div>
                        ) : insights.length > 0 ? (
                            <div className="grid gap-4">
                                {insights.map((insight, i) => (
                                    <div key={i} className="card hover:border-gold/30 transition-all">
                                        <div className="flex items-start gap-4">
                                            <div className="text-3xl">{insight.emoji}</div>
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    {getInsightIcon(insight.type)}
                                                    <h3 className="font-semibold text-foreground">{insight.title}</h3>
                                                </div>
                                                <p className="text-neutral">{insight.description}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="card text-center py-12">
                                <Lightbulb className="w-12 h-12 text-neutral mx-auto mb-4" />
                                <p className="text-neutral">No insights yet. Add some transactions first!</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Optimize Tab */}
                {activeTab === 'optimize' && (
                    <div className="space-y-4">
                        {/* Summary Card */}
                        {optimizeSummary && (
                            <div className="card bg-gradient-to-br from-success/10 to-emerald-500/10 border-success/20">
                                <div className="grid grid-cols-3 gap-6">
                                    <div className="text-center">
                                        <p className="text-sm text-neutral mb-1">Monthly Income</p>
                                        <p className="text-2xl font-bold text-foreground">
                                            ${(optimizeSummary.totalIncome / 100).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-neutral mb-1">Currently Budgeted</p>
                                        <p className="text-2xl font-bold text-foreground">
                                            ${(optimizeSummary.currentBudgeted / 100).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-sm text-neutral mb-1">Potential Savings</p>
                                        <p className="text-2xl font-bold text-success">
                                            ${(optimizeSummary.potentialSavings / 100).toLocaleString()}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex justify-between items-center">
                            <p className="text-neutral">AI-suggested budget adjustments</p>
                            <button
                                onClick={fetchOptimizations}
                                disabled={optimizeLoading}
                                className="btn text-sm"
                            >
                                <RefreshCw className={`w-4 h-4 ${optimizeLoading ? 'animate-spin' : ''}`} />
                                Analyze Budget
                            </button>
                        </div>

                        {optimizeLoading ? (
                            <div className="card text-center py-12">
                                <Loader2 className="w-8 h-8 text-gold animate-spin mx-auto mb-4" />
                                <p className="text-neutral">Optimizing your budget allocations...</p>
                            </div>
                        ) : recommendations.length > 0 ? (
                            <div className="grid gap-4">
                                {recommendations.map((rec, i) => {
                                    const diff = rec.suggestedAmount - rec.currentAmount;
                                    const isIncrease = diff > 0;
                                    
                                    return (
                                        <div key={i} className="card hover:border-gold/30 transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                                                    isIncrease ? 'bg-orange-500/20' : 'bg-success/20'
                                                }`}>
                                                    {isIncrease ? (
                                                        <ArrowUpRight className="w-6 h-6 text-orange-400" />
                                                    ) : (
                                                        <ArrowDownRight className="w-6 h-6 text-success" />
                                                    )}
                                                </div>
                                                <div className="flex-1">
                                                    <h3 className="font-semibold text-foreground">{rec.categoryName}</h3>
                                                    <p className="text-sm text-neutral">{rec.reasoning}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-sm text-neutral line-through">
                                                        ${(rec.currentAmount / 100).toFixed(0)}
                                                    </p>
                                                    <p className={`text-lg font-bold ${isIncrease ? 'text-orange-400' : 'text-success'}`}>
                                                        ${(rec.suggestedAmount / 100).toFixed(0)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}

                                <button 
                                    onClick={applyOptimizations}
                                    disabled={applyingOptimizations}
                                    className="btn btn-primary w-full"
                                >
                                    {applyingOptimizations ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <TrendingUp className="w-5 h-5" />
                                    )}
                                    {applyingOptimizations ? 'Applying...' : 'Apply All Recommendations'}
                                </button>
                            </div>
                        ) : (
                            <div className="card text-center py-12">
                                <TrendingUp className="w-12 h-12 text-neutral mx-auto mb-4" />
                                <p className="text-neutral">No recommendations available. Set up some budget categories first!</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
