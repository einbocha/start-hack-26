import { Asset, GameState } from './types';

export type UnlockResult = {
  nextAssets: Record<string, Asset>;
  newlyUnlocked: string[]; // asset ids
};

function unlock(nextAssets: Record<string, Asset>, id: string, newlyUnlocked: string[]) {
  const a = nextAssets[id];
  if (!a || a.unlocked) return;
  nextAssets[id] = { ...a, unlocked: true };
  newlyUnlocked.push(id);
}

function ownedCount(assets: Record<string, Asset>): number {
  return Object.values(assets).filter((a) => a.sharesOwned > 0).length;
}

function experiencedBigSwing(state: GameState): boolean {
  // “Experienced volatility” = any owned asset had a big yearly move at least once.
  for (const a of Object.values(state.assets)) {
    if (a.sharesOwned <= 0) continue;
    const h = a.priceHistory;
    if (h.length < 2) continue;
    const prev = h[h.length - 2].price;
    const cur = h[h.length - 1].price;
    const chg = Math.abs((cur - prev) / prev);
    if (chg >= 0.12) return true;
  }
  return false;
}

export function applyProgression(state: GameState, nextAssets: Record<string, Asset>): UnlockResult {
  const newlyUnlocked: string[] = [];

  // Deterministic, easy-to-understand progression path:
  // Phase 0 (start): Novartis is unlocked in assets.ts
  // Phase 1 (Year >= 2028): unlock 2 more single stocks
  // Phase 2 (diversified: own >=2 assets): unlock 2 more single stocks
  // Phase 3 (experienced volatility): unlock broad ETFs
  // Phase 4 (after at least one event + year >= 2031): unlock bond ETF

  if (state.year >= 2028) {
    unlock(nextAssets, 'apple', newlyUnlocked);
    unlock(nextAssets, 'postfinance', newlyUnlocked);
  }

  if (ownedCount(state.assets) >= 2) {
    unlock(nextAssets, 'jpm', newlyUnlocked);
    unlock(nextAssets, 'logitech', newlyUnlocked);
  }

  if (experiencedBigSwing(state)) {
    unlock(nextAssets, 'etf-swiss', newlyUnlocked);
    unlock(nextAssets, 'etf-global', newlyUnlocked);
    unlock(nextAssets, 'etf-tech', newlyUnlocked);
    unlock(nextAssets, 'etf-health', newlyUnlocked);
  }

  if (state.lastEvent && state.year >= 2031) {
    unlock(nextAssets, 'etf-bonds', newlyUnlocked);
  }

  // Emerging markets “spice” later.
  if (state.year >= 2032) {
    unlock(nextAssets, 'tencent', newlyUnlocked);
    unlock(nextAssets, 'icici', newlyUnlocked);
  }
  if (state.year >= 2033) {
    unlock(nextAssets, 'eli-lilly', newlyUnlocked);
  }

  return { nextAssets, newlyUnlocked };
}

