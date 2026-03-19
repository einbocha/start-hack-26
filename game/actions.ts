import { Asset, GameState } from './types';

function fmtMoney(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function buy(state: GameState, assetId: string, qty: number): GameState {
  const asset = state.assets[assetId];
  if (!asset) return { ...state, lastActionMessage: 'Unknown asset.' };
  if (!asset.unlocked) return { ...state, lastActionMessage: 'This building is still locked.' };
  if (qty <= 0) return { ...state, lastActionMessage: 'Invalid quantity.' };

  const cost = asset.currentPrice * qty;
  if (state.player.cash < cost) {
    return { ...state, lastActionMessage: `Not enough cash. Need ${fmtMoney(cost)}.` };
  }

  const nextAsset: Asset = {
    ...asset,
    sharesOwned: asset.sharesOwned + qty,
    totalCostBasis: asset.totalCostBasis + cost,
  };

  return {
    ...state,
    player: { ...state.player, cash: state.player.cash - cost },
    assets: { ...state.assets, [assetId]: nextAsset },
    lastActionMessage: `Bought ${qty} share${qty === 1 ? '' : 's'} of ${asset.displayName}.`,
  };
}

export function sell(state: GameState, assetId: string, qty: number): GameState {
  const asset = state.assets[assetId];
  if (!asset) return { ...state, lastActionMessage: 'Unknown asset.' };
  if (!asset.unlocked) return { ...state, lastActionMessage: 'This building is still locked.' };
  if (qty <= 0) return { ...state, lastActionMessage: 'Invalid quantity.' };
  if (asset.sharesOwned < qty) {
    return { ...state, lastActionMessage: `You only own ${asset.sharesOwned} share${asset.sharesOwned === 1 ? '' : 's'}.` };
  }

  const proceeds = asset.currentPrice * qty;
  const nextAsset: Asset = {
    ...asset,
    sharesOwned: asset.sharesOwned - qty,
    // keep cost basis simple (net tracking), good enough for game + later extension
    totalCostBasis: Math.max(0, asset.totalCostBasis - proceeds),
  };

  const bigDrop = asset.priceHistory.length >= 2
    ? (asset.currentPrice - asset.priceHistory[asset.priceHistory.length - 2].price) / asset.priceHistory[asset.priceHistory.length - 2].price
    : 0;

  const panicHint = bigDrop <= -0.15 ? ' Note: panic selling can lock in losses.' : '';

  return {
    ...state,
    player: { ...state.player, cash: state.player.cash + proceeds },
    assets: { ...state.assets, [assetId]: nextAsset },
    lastActionMessage: `Sold ${qty} share${qty === 1 ? '' : 's'} of ${asset.displayName}.${panicHint}`,
  };
}

