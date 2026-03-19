import { Asset, GameState } from './types';

export type UnlockResult = {
  nextAssets: Record<string, Asset>;
  newlyUnlocked: string[]; // asset ids
};

const GAME_LENGTH_YEARS = 100;

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function deterministic01(seed: number, salt: number): number {
  // Fast deterministic pseudo-random in [0,1).
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function unlockYears(state: GameState): { mediumAt: number; lowAt: number; etfAt: number } {
  const startYear = state.inflationHistory[0]?.year ?? state.year;
  const endYear = startYear + (GAME_LENGTH_YEARS - 1);
  const span = Math.max(1, endYear - startYear);
  const r1 = deterministic01(state.seed, 101);
  const r2 = deterministic01(state.seed, 202);
  const r3 = deterministic01(state.seed, 303);

  // Non-linear, trend-forward unlock milestones with small randomness.
  const mediumAt = startYear + Math.round(span * (0.14 + r1 * 0.09)); // ~year 14-23
  const lowAt = startYear + Math.round(span * (0.36 + r2 * 0.16)); // ~year 36-52
  const etfAt = startYear + Math.round(span * (0.56 + r3 * 0.24)); // ~year 56-80
  return { mediumAt, lowAt, etfAt };
}

export function applyProgression(state: GameState, nextAssets: Record<string, Asset>): UnlockResult {
  const newlyUnlocked: string[] = [];
  const { mediumAt, lowAt, etfAt } = unlockYears(state);
  const allowMedium = state.year >= mediumAt;
  const allowLow = state.year >= lowAt;
  const allowEtf = state.year >= etfAt;

  for (const [id, asset] of Object.entries(nextAssets)) {
    let shouldUnlock = asset.unlocked;
    if (asset.type === 'property') {
      shouldUnlock = false;
    } else if (asset.type === 'etf') {
      // ETFs open in the later half of the run.
      shouldUnlock = allowEtf;
    } else if (asset.type === 'stock') {
      // Start with high-volatility names; gradually open medium, then low.
      shouldUnlock =
        asset.volatilityLabel === 'high' ||
        (asset.volatilityLabel === 'medium' && allowMedium) ||
        (asset.volatilityLabel === 'low' && allowLow);
    }

    if (shouldUnlock && !asset.unlocked) newlyUnlocked.push(id);
    nextAssets[id] = { ...asset, unlocked: shouldUnlock };
  }

  return { nextAssets, newlyUnlocked };
}

