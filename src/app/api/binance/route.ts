import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import crypto from 'crypto';
import { getProfileId } from '@/lib/profile';

const BINANCE_API_URL = 'https://api.binance.com';

// Sign Binance API request
function signRequest(queryString: string, secret: string): string {
    return crypto
        .createHmac('sha256', secret)
        .update(queryString)
        .digest('hex');
}

interface BinanceBalance {
    asset: string;
    free: string;
    locked: string;
}

// Shared function to fetch account data from Binance
async function fetchBinanceAccount(apiKey: string, apiSecret: string) {
    // Get Binance server time RIGHT BEFORE making request to minimize drift
    const timeRes = await fetch(`${BINANCE_API_URL}/api/v3/time`);
    const timeData = await timeRes.json();
    const timestamp = timeData.serverTime;
    
    const recvWindow = 60000;
    const queryString = `timestamp=${timestamp}&recvWindow=${recvWindow}`;
    const signature = signRequest(queryString, apiSecret);

    console.log('Binance API call - timestamp:', timestamp, 'key length:', apiKey.length, 'secret length:', apiSecret.length);

    const response = await fetch(
        `${BINANCE_API_URL}/api/v3/account?${queryString}&signature=${signature}`,
        {
            headers: {
                'X-MBX-APIKEY': apiKey,
            },
        }
    );

    return response;
}

// GET - Fetch wallet balances from Binance
export async function GET(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        // Get Binance credentials
        const integration = await prisma.apiIntegration.findFirst({
            where: { provider: 'binance', profileId },
        });

        if (!integration || !integration.enabled) {
            return NextResponse.json({ 
                error: 'Binance integration not configured',
                configured: false 
            }, { status: 400 });
        }

        const apiKey = integration.apiKey.trim();
        const apiSecret = integration.apiSecret.trim();

        const response = await fetchBinanceAccount(apiKey, apiSecret);

        if (!response.ok) {
            const error = await response.json();
            console.error('Binance API error:', error);
            return NextResponse.json({ 
                error: error.msg || 'Failed to fetch from Binance',
                code: error.code 
            }, { status: response.status });
        }

        const data = await response.json();
        
        // Filter only assets with balance > 0
        const balances = data.balances
            .filter((b: BinanceBalance) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0)
            .map((b: BinanceBalance) => ({
                asset: b.asset,
                free: parseFloat(b.free),
                locked: parseFloat(b.locked),
                total: parseFloat(b.free) + parseFloat(b.locked),
            }));

        return NextResponse.json({ 
            balances,
            accountType: data.accountType,
            canTrade: data.canTrade,
            canWithdraw: data.canWithdraw,
            canDeposit: data.canDeposit,
        });
    } catch (error) {
        console.error('Error fetching Binance wallet:', error);
        return NextResponse.json({ error: 'Failed to fetch Binance wallet' }, { status: 500 });
    }
}

// POST - Sync Binance holdings to assets
export async function POST(request: NextRequest) {
    try {
        const profileId = await getProfileId(request);
        // Get Binance credentials
        const integration = await prisma.apiIntegration.findFirst({
            where: { provider: 'binance', profileId },
        });

        if (!integration || !integration.enabled) {
            return NextResponse.json({ 
                error: 'Binance integration not configured' 
            }, { status: 400 });
        }

        const apiKey = integration.apiKey.trim();
        const apiSecret = integration.apiSecret.trim();

        const response = await fetchBinanceAccount(apiKey, apiSecret);

        if (!response.ok) {
            const error = await response.json();
            console.error('Binance POST error:', error);
            return NextResponse.json({ 
                error: error.msg || 'Failed to fetch from Binance' 
            }, { status: response.status });
        }

        const data = await response.json();
        const balances = data.balances
            .filter((b: BinanceBalance) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);

        // Get current prices for each asset
        const priceResponse = await fetch(`${BINANCE_API_URL}/api/v3/ticker/price`);
        const allPrices = await priceResponse.json();
        const priceMap: Record<string, number> = {};
        
        for (const p of allPrices) {
            // Store USDT pairs - e.g., BTCUSDT price
            if (p.symbol.endsWith('USDT')) {
                const asset = p.symbol.replace('USDT', '');
                priceMap[asset] = parseFloat(p.price);
            }
        }

        // Sync each asset
        let created = 0;
        let updated = 0;

        for (const balance of balances) {
            const total = parseFloat(balance.free) + parseFloat(balance.locked);
            const price = priceMap[balance.asset] || 0;
            const symbol = `${balance.asset}-BINANCE`;
            
            // Skip stablecoins that are essentially 1:1
            const isStable = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD'].includes(balance.asset);
            const priceInCents = isStable ? 100 : Math.round(price * 100);

            const existing = await prisma.asset.findFirst({
                where: { symbol },
            });

            if (existing) {
                await prisma.asset.update({
                    where: { id: existing.id },
                    data: {
                        quantity: total,
                        currentPrice: priceInCents,
                        currency: 'USD', // Binance prices are in USDT
                        lastUpdated: new Date(),
                    },
                });
                updated++;
            } else {
                // New asset: set costBasis = currentValue so initial sync shows 0% return
                const totalValue = Math.round(total * priceInCents);
                await prisma.asset.create({
                    data: {
                        symbol,
                        name: `${balance.asset} (Binance)`,
                        assetClass: 'crypto',
                        quantity: total,
                        currentPrice: priceInCents,
                        costBasis: totalValue,  // Start with no gain/loss
                        currency: 'USD',
                        isManual: false,
                    },
                });
                created++;
            }
        }

        // Update last synced
        if (integration) {
            await prisma.apiIntegration.update({
                where: { id: integration.id },
                data: { lastSynced: new Date() },
            });
        }

        return NextResponse.json({ 
            success: true,
            created,
            updated,
            total: balances.length,
        });
    } catch (error) {
        console.error('Error syncing Binance wallet:', error);
        return NextResponse.json({ error: 'Failed to sync Binance wallet' }, { status: 500 });
    }
}
