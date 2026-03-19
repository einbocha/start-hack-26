import { eventApplies, pickYearEvent } from './events';
import { applyProgression } from './progression';
import { rngFrom } from './rng';
import { Asset, GameState } from './types';
import { netWorth } from './portfolio';

function clampPrice(p: number): number {
  return Math.max(1, p);
}

function volatilityFactor(asset: Asset): number {
  // ETFs are usually calmer than single stocks.
  if (asset.type === 'etf' && asset.sector === 'Bonds') return asset.volatility * 0.35;
  if (asset.type === 'etf') return asset.volatility * 0.65;
  return asset.volatility;
}

export function simulateAssetYear(params: {
  asset: Asset;
  seed: number;
  year: number;
  eventMultiplier: number;
}): number {
  const { asset, seed, year, eventMultiplier } = params;
  const rng = rngFrom(seed, year + asset.id.length * 997);
  const noise = (rng() * 2 - 1) * volatilityFactor(asset);
  const growth = asset.yearlyDrift + noise;
  const next = asset.currentPrice * (1 + growth) * eventMultiplier;
  return clampPrice(next);
}

export function advanceOneYear(state: GameState): GameState {
  const nextYear = state.year + 1;
  const rng = rngFrom(state.seed, nextYear);
  const event = pickYearEvent(nextYear, rng, state.assets);

  // --- Inflation simulation ---
  // Simple, mean-reverting inflation model:
  // - long-term target around 2%
  // - gentle random noise
  // - clamped to a realistic band (-1% .. 6%)
  const target = 0.02;
  const prevRate = state.inflationRate ?? target;
  const noise = (rng() - 0.5) * 0.01; // +/-0.5% random wiggle
  const meanRevert = 0.4 * (target - prevRate);
  let inflationRate = prevRate + meanRevert + noise;
  inflationRate = Math.min(0.06, Math.max(-0.01, inflationRate));

  const nextInflationIndex = state.inflationIndex * (1 + inflationRate);

  const nextAssets: Record<string, Asset> = {};
  for (const a of Object.values(state.assets)) {
    if (!a.unlocked) {
      nextAssets[a.id] = a;
      continue;
    }
    const eventMult = event && eventApplies(event, a) ? event.multiplier : 1;
    const nextPrice = simulateAssetYear({ asset: a, seed: state.seed, year: nextYear, eventMultiplier: eventMult });
    nextAssets[a.id] = {
      ...a,
      currentPrice: nextPrice,
      priceHistory: [...a.priceHistory, { year: nextYear, price: nextPrice }],
    };
  }

  const progression = applyProgression({ ...state, year: nextYear, lastEvent: event }, nextAssets);

  const unlockMsg =
    progression.newlyUnlocked.length > 0
      ? `Unlocked: ${progression.newlyUnlocked.map((id) => progression.nextAssets[id].displayName).join(', ')}.`
      : null;

  const eventMsg = event ? `${event.title}: ${event.description}` : null;

  // Nominal net worth at end of year.
  const nominalNetWorth = netWorth({ ...state, year: nextYear, assets: progression.nextAssets });
  // Real (inflation-cleaned) net worth, expressed in starting-year money.
  const realNetWorth = nominalNetWorth / nextInflationIndex;

  return {
    ...state,
    year: nextYear,
    assets: progression.nextAssets,
    lastEvent: event,
    lastActionMessage: [eventMsg, unlockMsg].filter(Boolean).join(' ') || null,
    inflationRate,
    inflationIndex: nextInflationIndex,
    inflationHistory: [
      ...state.inflationHistory,
      { year: nextYear, rate: inflationRate, index: nextInflationIndex },
    ],
    // Store *real* net worth for the chart (inflation-adjusted to the starting year).
    netWorthHistory: [
      ...state.netWorthHistory,
      { year: nextYear, price: realNetWorth },
    ],
  };
}

