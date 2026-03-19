import { activeEventsForYear, computeEventMultipliers } from './events';
import { applyProgression } from './progression';
import { rngFrom } from './rng';
import { Asset, GameState } from './types';
import { netWorth } from './portfolio';

const GAME_LENGTH_YEARS = 100;

function clampPrice(p: number): number {
  return Math.max(1, p);
}

function volatilityFactor(asset: Asset): number {
  if (asset.volatilityLabel === 'stable') return asset.volatility * 0.4;
  // ETFs are usually calmer than single stocks.
  if (asset.type === 'etf' && asset.sector === 'Bonds') return asset.volatility * 0.35;
  if (asset.type === 'etf') return asset.volatility * 0.65;
  // High-risk single stocks should swing a lot more year-to-year.
  if (asset.volatilityLabel === 'high') return asset.volatility * 3.0;
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
  // For "high" volatility names, reduce drift so long-run outcome is
  // relatively neutral (only events provide the mean drift).
  const drift = asset.volatilityLabel === 'high' ? 0 : asset.yearlyDrift;
  const noise = (rng() * 2 - 1) * volatilityFactor(asset);
  // Mean reversion toward the starting baseline so prices don't grind
  // down toward the floor over time (and they recover after big drops).
  const meanRevertStrength = asset.volatilityLabel === 'high' ? 0.12 : 0.06;
  const meanRevert = meanRevertStrength * (asset.basePrice / asset.currentPrice - 1);
  const growth = drift + noise + meanRevert;
  const next = asset.currentPrice * (1 + growth) * eventMultiplier;
  return clampPrice(next);
}

export function advanceOneYear(state: GameState): GameState {
  const startYear = state.inflationHistory[0]?.year ?? state.year;
  const endYear = startYear + (GAME_LENGTH_YEARS - 1);
  if (state.year >= endYear) {
    return {
      ...state,
      lastActionMessage: `Run complete: you reached year ${endYear} (${GAME_LENGTH_YEARS} years).`,
    };
  }

  const nextYear = state.year + 1;
  const rng = rngFrom(state.seed, nextYear);
  const activeEvents = activeEventsForYear(state.eventCatalog, nextYear);
  const eventMultipliers = computeEventMultipliers(activeEvents, state.assets);
  const modeDriver =
    activeEvents.find((e) => e.seriousness === 'timed' || e.seriousness === 'serious') ??
    activeEvents.find((e) => e.mode !== 'both') ??
    null;
  const nextUiMode =
    modeDriver?.mode === 'city'
      ? 'city'
      : modeDriver?.mode === 'stock'
        ? 'stocks'
        : state.uiMode;
  const legacyEvent = activeEvents[0]
    ? {
        id: activeEvents[0].id,
        title: 'Scripted event',
        description: activeEvents[0].text,
        appliesTo: { kind: 'asset' as const, assetId: Object.keys(state.assets)[0] ?? '' },
        multiplier: 1,
      }
    : null;

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
    const eventMult = eventMultipliers[a.id] ?? 1;
    const nextPrice = simulateAssetYear({ asset: a, seed: state.seed, year: nextYear, eventMultiplier: eventMult });
    nextAssets[a.id] = {
      ...a,
      currentPrice: nextPrice,
      priceHistory: [...a.priceHistory, { year: nextYear, price: nextPrice }],
    };
  }

  const progression = applyProgression({ ...state, year: nextYear, lastEvent: legacyEvent }, nextAssets);

  const unlockMsg =
    progression.newlyUnlocked.length > 0
      ? `Unlocked: ${progression.newlyUnlocked.map((id) => progression.nextAssets[id].displayName).join(', ')}.`
      : null;

  const eventMsg = activeEvents[0] ? activeEvents[0].text : null;

  // Nominal net worth at end of year.
  const nominalNetWorth = netWorth({ ...state, year: nextYear, assets: progression.nextAssets });
  // Real (inflation-cleaned) net worth, expressed in starting-year money.
  const realNetWorth = nominalNetWorth / nextInflationIndex;

  return {
    ...state,
    year: nextYear,
    assets: progression.nextAssets,
    lastEvent: legacyEvent,
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
    activeEvents,
    uiMode: nextUiMode,
  };
}

