import { Asset, GameState } from './types';

export function holdingValue(asset: Asset): number {
  return asset.sharesOwned * asset.currentPrice;
}

export function investedValue(assets: Record<string, Asset>): number {
  let total = 0;
  for (const a of Object.values(assets)) total += holdingValue(a);
  return total;
}

export function netWorth(state: GameState): number {
  return state.player.cash + investedValue(state.assets);
}

export function totalInvestedCostBasis(assets: Record<string, Asset>): number {
  let total = 0;
  for (const a of Object.values(assets)) total += a.totalCostBasis;
  return total;
}

export function totalPnL(state: GameState): number {
  return netWorth(state) - state.player.startingCash;
}

export function diversificationHint(assets: Record<string, Asset>): string | null {
  const owned = Object.values(assets).filter((a) => a.sharesOwned > 0);
  if (owned.length <= 1 && owned.length > 0) {
    return 'Tip: owning more than one asset can reduce “single-company” risk.';
  }
  return null;
}

