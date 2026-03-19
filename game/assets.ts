import { Asset, BuildingVisualType, Market, Sector, VolatilityLabel } from './types';

function vol(label: VolatilityLabel): { label: VolatilityLabel; v: number } {
  switch (label) {
    case 'low':
      return { label, v: 0.08 };
    case 'medium':
      return { label, v: 0.12 };
    case 'high':
      return { label, v: 0.22 };
    case 'stable':
      // Much calmer than any stock.
      return { label, v: 0.03 };
  }
}

function asset(params: {
  id: string;
  name: string;
  displayName: string;
  symbol: string;
  type: 'stock' | 'etf';
  market: Market;
  sector: Sector;
  buildingVisualType: BuildingVisualType;
  basePrice: number;
  yearlyDrift: number;
  volatility: VolatilityLabel;
  peRatio: number;
  description: string;
  unlocked: boolean;
  categoryTags: Asset['categoryTags'];
}): Asset {
  const { v, label } = vol(params.volatility);
  return {
    id: params.id,
    name: params.name,
    displayName: params.displayName,
    symbol: params.symbol,
    type: params.type,
    market: params.market,
    sector: params.sector,
    buildingVisualType: params.buildingVisualType,
    basePrice: params.basePrice,
    currentPrice: params.basePrice,
    yearlyDrift: params.yearlyDrift,
    volatility: v,
    volatilityLabel: label,
    peRatio: params.peRatio,
    description: params.description,
    unlocked: params.unlocked,
    sharesOwned: 0,
    totalCostBasis: 0,
    priceHistory: [{ year: 2026, price: params.basePrice }],
    categoryTags: params.categoryTags,
  };
}

export function createStarterAssets(): Record<string, Asset> {
  const assets: Asset[] = [
    asset({
      id: 'novartis',
      name: 'Novartis',
      displayName: 'Novartis',
      symbol: 'NVS',
      type: 'stock',
      market: 'Switzerland',
      sector: 'Healthcare',
      buildingVisualType: 'Hospital',
      basePrice: 92,
      yearlyDrift: 0.06,
      volatility: 'medium',
      peRatio: 16,
      description: 'A Swiss healthcare leader. Steady, but still moves with the market.',
      unlocked: true,
      categoryTags: ['intro', 'sector', 'market'],
    }),
    asset({
      id: 'eli-lilly',
      name: 'Eli Lilly',
      displayName: 'Eli Lilly',
      symbol: 'LLY',
      type: 'stock',
      market: 'USA',
      sector: 'Healthcare',
      buildingVisualType: 'Factory',
      basePrice: 140,
      yearlyDrift: 0.08,
      volatility: 'high',
      peRatio: 38,
      description: 'A fast-moving healthcare company. Big upside, bigger swings.',
      unlocked: false,
      categoryTags: ['volatility', 'sector', 'market'],
    }),
    asset({
      id: 'logitech',
      name: 'Logitech',
      displayName: 'Logitech',
      symbol: 'LOGN',
      type: 'stock',
      market: 'Switzerland',
      sector: 'Technology',
      buildingVisualType: 'RetailShop',
      basePrice: 62,
      yearlyDrift: 0.07,
      volatility: 'high',
      peRatio: 22,
      description: 'Tech sells cool stuff. Demand is cyclical—prices can jump around.',
      unlocked: false,
      categoryTags: ['volatility', 'sector'],
    }),
    asset({
      id: 'apple',
      name: 'Apple',
      displayName: 'Apple',
      symbol: 'AAPL',
      type: 'stock',
      market: 'USA',
      sector: 'Technology',
      buildingVisualType: 'Skyscraper',
      basePrice: 185,
      yearlyDrift: 0.07,
      volatility: 'medium',
      peRatio: 28,
      description: 'A mega-cap tech giant. Often steadier than smaller tech names.',
      unlocked: false,
      categoryTags: ['sector', 'market'],
    }),
    asset({
      id: 'postfinance',
      name: 'PostFinance',
      displayName: 'PostFinance',
      symbol: 'POST',
      type: 'stock',
      market: 'Switzerland',
      sector: 'Finance',
      buildingVisualType: 'PostBuilding',
      basePrice: 35,
      yearlyDrift: 0.04,
      volatility: 'low',
      peRatio: 12,
      description: 'A Swiss finance staple. Lower volatility, slower growth.',
      unlocked: false,
      categoryTags: ['market', 'sector'],
    }),
    asset({
      id: 'jpm',
      name: 'J.P. Morgan',
      displayName: 'J.P. Morgan',
      symbol: 'JPM',
      type: 'stock',
      market: 'USA',
      sector: 'Finance',
      buildingVisualType: 'Bank',
      basePrice: 150,
      yearlyDrift: 0.05,
      volatility: 'medium',
      peRatio: 13,
      description: 'A major bank. Cyclical—can benefit in strong economies.',
      unlocked: false,
      categoryTags: ['sector', 'market'],
    }),
    asset({
      id: 'tencent',
      name: 'Tencent',
      displayName: 'Tencent',
      symbol: 'TCEHY',
      type: 'stock',
      market: 'Emerging Markets',
      sector: 'Technology',
      buildingVisualType: 'Arcade',
      basePrice: 48,
      yearlyDrift: 0.09,
      volatility: 'high',
      peRatio: 24,
      description: 'Emerging tech with strong growth—and strong uncertainty.',
      unlocked: false,
      categoryTags: ['volatility', 'market'],
    }),
    asset({
      id: 'icici',
      name: 'ICICI Bank',
      displayName: 'ICICI Bank',
      symbol: 'IBN',
      type: 'stock',
      market: 'Emerging Markets',
      sector: 'Finance',
      buildingVisualType: 'Office',
      basePrice: 30,
      yearlyDrift: 0.08,
      volatility: 'high',
      peRatio: 18,
      description: 'Emerging finance: higher potential, higher risk.',
      unlocked: false,
      categoryTags: ['market', 'volatility'],
    }),

    asset({
      id: 'etf-swiss',
      name: 'Swiss Market ETF',
      displayName: 'Swiss Market ETF',
      symbol: 'SMI-ETF',
      type: 'etf',
      market: 'Switzerland',
      sector: 'Broad Market',
      buildingVisualType: 'ETF',
      basePrice: 100,
      yearlyDrift: 0.05,
      volatility: 'stable',
      peRatio: 18,
      description: 'A basket of Swiss companies. Diversification in one click.',
      unlocked: false,
      categoryTags: ['etf', 'diversification', 'market'],
    }),
    asset({
      id: 'etf-global',
      name: 'Global Equity ETF',
      displayName: 'Global Equity ETF',
      symbol: 'GLB-ETF',
      type: 'etf',
      market: 'Global',
      sector: 'Broad Market',
      buildingVisualType: 'ETF',
      basePrice: 120,
      yearlyDrift: 0.06,
      volatility: 'stable',
      peRatio: 19,
      description: 'Global stocks bundled together. Lower single-company risk.',
      unlocked: false,
      categoryTags: ['etf', 'diversification'],
    }),
    asset({
      id: 'etf-tech',
      name: 'Technology ETF',
      displayName: 'Technology ETF',
      symbol: 'TECH-ETF',
      type: 'etf',
      market: 'Global',
      sector: 'Technology',
      buildingVisualType: 'ETF',
      basePrice: 110,
      yearlyDrift: 0.07,
      volatility: 'stable',
      peRatio: 26,
      description: 'Tech exposure without betting on just one company.',
      unlocked: false,
      categoryTags: ['etf', 'sector', 'diversification'],
    }),
    asset({
      id: 'etf-health',
      name: 'Healthcare ETF',
      displayName: 'Healthcare ETF',
      symbol: 'HLTH-ETF',
      type: 'etf',
      market: 'Global',
      sector: 'Healthcare',
      buildingVisualType: 'ETF',
      basePrice: 105,
      yearlyDrift: 0.06,
      volatility: 'stable',
      peRatio: 20,
      description: 'Healthcare basket: steadier than many single stocks.',
      unlocked: false,
      categoryTags: ['etf', 'sector', 'diversification'],
    }),
    asset({
      id: 'etf-bonds',
      name: 'Bond ETF',
      displayName: 'Bond ETF',
      symbol: 'BOND-ETF',
      type: 'etf',
      market: 'Global',
      sector: 'Bonds',
      buildingVisualType: 'ETF',
      basePrice: 80,
      yearlyDrift: 0.03,
      volatility: 'stable',
      peRatio: 0,
      description: 'Bonds tend to be calmer. Lower returns, smoother ride.',
      unlocked: false,
      categoryTags: ['etf', 'bonds', 'diversification'],
    }),
  ];

  return Object.fromEntries(assets.map((a) => [a.id, a]));
}

