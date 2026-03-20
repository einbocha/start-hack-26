export type AssetType = 'stock' | 'etf' | 'property';

export type Market = 'Switzerland' | 'USA' | 'Emerging Markets' | 'Global';

export type Sector = 'Healthcare' | 'Technology' | 'Finance' | 'Broad Market' | 'Bonds';

export type VolatilityLabel = 'low' | 'medium' | 'high' | 'stable';

export type BuildingVisualType =
  | 'Hospital'
  | 'Factory'
  | 'RetailShop'
  | 'Skyscraper'
  | 'PostBuilding'
  | 'Bank'
  | 'Arcade'
  | 'Office'
  | 'ETF';

export type CategoryTag =
  | 'intro'
  | 'volatility'
  | 'market'
  | 'sector'
  | 'etf'
  | 'diversification'
  | 'panicSelling'
  | 'bonds';

export type PricePoint = { year: number; price: number };

export type Asset = {
  id: string;
  name: string;
  displayName: string;
  symbol: string;
  type: AssetType;
  market: Market;
  sector: Sector;
  buildingVisualType: BuildingVisualType;

  currentPrice: number;
  basePrice: number;
  yearlyDrift: number; // expected mean yearly return, e.g. 0.06 = +6%
  volatilityLabel: VolatilityLabel;
  volatility: number; // stdev-like amplitude, e.g. 0.12 = ~12% swings

  peRatio: number;
  description: string;
  unlocked: boolean;

  sharesOwned: number;
  totalCostBasis: number; // total spent net of sells (simple tracking)
  priceHistory: PricePoint[];
  categoryTags: CategoryTag[];
};

export type PlayerState = {
  startingCash: number;
  cash: number;
};

export type YearEvent = {
  id: string;
  title: string;
  description: string;
  appliesTo: { kind: 'sector'; sector: Sector } | { kind: 'asset'; assetId: string };
  multiplier: number; // price multiplier applied this year, e.g. 0.9 means -10%
};

export type EventMode = 'city' | 'stock' | 'both';
export type EventSeriousness = 'neutral' | 'negative' | 'serious' | 'timed' | 'info';

export type ScriptedEvent = {
  id: string;
  text: string;
  cityText?: string;
  assetText?: string;
  startYear: number;
  endYear: number;
  mode: EventMode;
  seriousness: EventSeriousness;
  assets: string[];
  symbols: string[];
  values: number[];
};

export type GameState = {
  seed: number;
  year: number;
  player: PlayerState;
  assets: Record<string, Asset>;
  selectedAssetId: string | null;
  lastEvent: YearEvent | null;
  lastActionMessage: string | null;
  netWorthHistory: PricePoint[];
  // Inflation model
  // inflationRate: year-over-year CPI change applied at the *end* of this year (e.g. 0.02 = 2%)
  inflationRate: number;
  // inflationIndex: cumulative price level vs. starting year (starts at 1, then multiplies by (1+rate) each year)
  inflationIndex: number;
  // per-year history for education / future UI
  inflationHistory: { year: number; rate: number; index: number }[];
  uiMode: 'city' | 'stocks';
  eventCatalog: ScriptedEvent[];
  activeEvents: ScriptedEvent[];
};

export type GameAction =
  | { type: 'SELECT_ASSET'; assetId: string | null }
  | { type: 'BUY'; assetId: string; qty: number }
  | { type: 'SELL'; assetId: string; qty: number }
  | { type: 'ADVANCE_YEAR' }
  | { type: 'TOGGLE_UI_MODE' }
  | { type: 'CLEAR_MESSAGE' };

