import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance();

// Fetch live prices for assets
export async function POST(request: NextRequest) {
    console.log('=== POST /api/investments/prices called ===');
    try {
        let symbols: string[] | undefined;
        let assetClass: string | undefined;
        
        // Handle empty or invalid JSON body gracefully
        try {
            const text = await request.text();
            if (text) {
                const body = JSON.parse(text);
                symbols = body.symbols;
                assetClass = body.assetClass;
            }
        } catch {
            // Body is empty or invalid JSON - proceed with defaults (fetch all)
        }

        // If no symbols provided, fetch all non-manual assets
        let assetsToUpdate;
        if (symbols && symbols.length > 0) {
            assetsToUpdate = await prisma.asset.findMany({
                where: {
                    symbol: { in: symbols },
                    isManual: false,
                },
            });
        } else {
            assetsToUpdate = await prisma.asset.findMany({
                where: {
                    isManual: false,
                    ...(assetClass && { assetClass }),
                },
            });
        }

        if (assetsToUpdate.length === 0) {
            return NextResponse.json({ message: 'No assets to update', updated: [] });
        }

        const updated = [];

        // Group by asset class for different API calls
        const cryptoAssets = assetsToUpdate.filter(a => a.assetClass === 'crypto');
        const stockAssets = assetsToUpdate.filter(a => ['stock', 'etf'].includes(a.assetClass));
        
        console.log('Assets to update:', assetsToUpdate.map(a => ({ symbol: a.symbol, class: a.assetClass })));
        console.log('Stock assets:', stockAssets.map(a => a.symbol));
        console.log('Crypto assets:', cryptoAssets.map(a => a.symbol));

        // Fetch crypto prices from CoinGecko
        if (cryptoAssets.length > 0) {
            const cryptoPrices = await fetchCryptoPrices(cryptoAssets.map(a => a.symbol));
            for (const asset of cryptoAssets) {
                const price = cryptoPrices[asset.symbol.toLowerCase()];
                if (price) {
                    await prisma.asset.update({
                        where: { id: asset.id },
                        data: {
                            currentPrice: Math.round(price * 100), // Convert to cents
                            lastUpdated: new Date(),
                        },
                    });
                    updated.push({ symbol: asset.symbol, price, currency: asset.currency });
                }
            }
        }

        // Fetch stock/ETF prices from Yahoo Finance
        if (stockAssets.length > 0) {
            for (const asset of stockAssets) {
                const yahooData = await fetchYahooPrice(asset.symbol);
                if (yahooData.price) {
                    await prisma.asset.update({
                        where: { id: asset.id },
                        data: {
                            currentPrice: Math.round(yahooData.price * 100), // Convert to cents
                            lastUpdated: new Date(),
                            // Update dividend yield if available
                            ...(yahooData.dividendYield !== null && { dividendYield: yahooData.dividendYield }),
                        },
                    });
                    updated.push({ 
                        symbol: asset.symbol, 
                        price: yahooData.price, 
                        dividendYield: yahooData.dividendYield,
                        currency: asset.currency 
                    });
                }
            }
        }

        console.log('Updated prices:', updated);
        
        return NextResponse.json({ 
            message: `Updated ${updated.length} asset prices`,
            updated 
        });
    } catch (error) {
        console.error('Failed to fetch prices:', error);
        return NextResponse.json({ error: 'Failed to fetch prices' }, { status: 500 });
    }
}

// Fetch crypto prices from CoinGecko (free, no API key needed)
async function fetchCryptoPrices(symbols: string[]): Promise<Record<string, number>> {
    try {
        // Map common symbols to CoinGecko IDs
        const symbolToId: Record<string, string> = {
            btc: 'bitcoin',
            eth: 'ethereum',
            sol: 'solana',
            ada: 'cardano',
            doge: 'dogecoin',
            xrp: 'ripple',
            dot: 'polkadot',
            link: 'chainlink',
            matic: 'matic-network',
            avax: 'avalanche-2',
            luna: 'terra-luna-2',
            lunc: 'terra-luna',
            one: 'harmony',
            ankr: 'ankr',
            fet: 'fetch-ai',
        };

        const ids = symbols.map(s => symbolToId[s.toLowerCase()] || s.toLowerCase());
        const uniqueIds = [...new Set(ids)];

        const response = await fetch(
            `https://api.coingecko.com/api/v3/simple/price?ids=${uniqueIds.join(',')}&vs_currencies=aud`,
            { cache: 'no-store' }
        );

        if (!response.ok) {
            console.error('CoinGecko API error:', response.status);
            return {};
        }

        const data = await response.json();
        
        // Map back to original symbols
        const prices: Record<string, number> = {};
        for (const symbol of symbols) {
            const id = symbolToId[symbol.toLowerCase()] || symbol.toLowerCase();
            if (data[id]?.aud) {
                prices[symbol.toLowerCase()] = data[id].aud;
            }
        }

        return prices;
    } catch (error) {
        console.error('CoinGecko fetch error:', error);
        return {};
    }
}

interface YahooData {
    price: number | null;
    dividendYield: number | null;
}

// Fetch stock/ETF price and dividend yield from Yahoo Finance using yahoo-finance2
async function fetchYahooPrice(symbol: string): Promise<YahooData> {
    try {
        // Convert ASX symbols (e.g., ASX:VGS -> VGS.AX)
        let yahooSymbol = symbol;
        if (symbol.startsWith('ASX:')) {
            yahooSymbol = symbol.replace('ASX:', '') + '.AX';
        } else if (symbol.endsWith('.AX') || symbol.endsWith('.L') || symbol.endsWith('.TO')) {
            // Already has exchange suffix
            yahooSymbol = symbol;
        }
        // For US stocks like MSFT, AAPL, GOOGL - use as-is (no suffix)

        console.log(`Fetching Yahoo data for ${symbol} (yahooSymbol: ${yahooSymbol})`);
        
        const quote = await yahooFinance.quote(yahooSymbol);
        
        if (!quote) {
            console.error(`Yahoo Finance: No data for ${symbol}`);
            return { price: null, dividendYield: null };
        }

        const price = quote.regularMarketPrice || null;
        // trailingAnnualDividendYield is a decimal (e.g., 0.0076 for 0.76%)
        const dividendYield = quote.trailingAnnualDividendYield || 0;
        
        console.log(`Yahoo data for ${symbol}: price=${price}, dividendYield=${dividendYield}`);
        
        return { price, dividendYield };
    } catch (error) {
        console.error(`Yahoo fetch error for ${symbol}:`, error);
        return { price: null, dividendYield: null };
    }
}

// GET - fetch current prices without updating database (for previewing)
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol');
        const type = searchParams.get('type') || 'stock';

        if (!symbol) {
            return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
        }

        if (type === 'crypto') {
            const prices = await fetchCryptoPrices([symbol]);
            const price = prices[symbol.toLowerCase()] || null;
            if (price === null) {
                return NextResponse.json({ error: 'Price not found' }, { status: 404 });
            }
            return NextResponse.json({ 
                symbol: symbol.toUpperCase(), 
                name: getCryptoName(symbol),
                price, 
                currency: 'AUD' 
            });
        }

        // For stocks, get full quote info including name
        const quoteInfo = await fetchYahooQuote(symbol);
        
        if (!quoteInfo) {
            return NextResponse.json({ error: 'Symbol not found' }, { status: 404 });
        }

        return NextResponse.json({ 
            symbol: quoteInfo.symbol, 
            name: quoteInfo.name,
            price: quoteInfo.price, 
            currency: quoteInfo.currency || 'USD' 
        });
    } catch (error) {
        console.error('Price fetch error:', error);
        return NextResponse.json({ error: 'Failed to fetch price' }, { status: 500 });
    }
}

// Get crypto name from symbol
function getCryptoName(symbol: string): string {
    const names: Record<string, string> = {
        btc: 'Bitcoin',
        eth: 'Ethereum',
        sol: 'Solana',
        ada: 'Cardano',
        doge: 'Dogecoin',
        xrp: 'XRP',
        dot: 'Polkadot',
        link: 'Chainlink',
        matic: 'Polygon',
        avax: 'Avalanche',
        one: 'Harmony',
        ankr: 'Ankr',
        fet: 'Fetch.ai',
        bnb: 'BNB',
        usdt: 'Tether',
        usdc: 'USD Coin',
    };
    return names[symbol.toLowerCase()] || symbol.toUpperCase();
}

// Fetch full quote info from Yahoo Finance using yahoo-finance2 (includes name)
async function fetchYahooQuote(symbol: string): Promise<{ symbol: string; name: string; price: number; currency: string; dividendYield: number } | null> {
    try {
        let yahooSymbol = symbol;
        if (symbol.startsWith('ASX:')) {
            yahooSymbol = symbol.replace('ASX:', '') + '.AX';
        }

        let quote = await yahooFinance.quote(yahooSymbol).catch(() => null);
        
        // If not found and no suffix, try .AX for ASX
        if (!quote && !yahooSymbol.includes('.')) {
            yahooSymbol = yahooSymbol + '.AX';
            quote = await yahooFinance.quote(yahooSymbol).catch(() => null);
        }

        if (!quote) return null;

        return {
            symbol: quote.symbol || yahooSymbol,
            name: quote.longName || quote.shortName || yahooSymbol,
            price: quote.regularMarketPrice || 0,
            currency: quote.currency || 'USD',
            dividendYield: quote.trailingAnnualDividendYield || 0,
        };
    } catch (error) {
        console.error(`Yahoo quote error for ${symbol}:`, error);
        return null;
    }
}
