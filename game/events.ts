import { Asset, Sector, YearEvent } from './types';
import { Rng } from './rng';

export function pickYearEvent(year: number, rng: Rng, assets: Record<string, Asset>): YearEvent | null {
  // Keep it lightweight + debuggable: low probability, simple multipliers.
  const roll = rng();
  if (roll > 0.25) return null;

  const eventRoll = rng();
  if (eventRoll < 0.5) {
    return {
      id: `tech-reg-${year}`,
      title: 'Tech regulation scare',
      description: 'New rules spook investors. Tech takes a hit this year.',
      appliesTo: { kind: 'sector', sector: 'Technology' },
      multiplier: 0.88,
    };
  }

  return {
    id: `health-innov-${year}`,
    title: 'Healthcare innovation',
    description: 'A big breakthrough boosts confidence in healthcare.',
    appliesTo: { kind: 'sector', sector: 'Healthcare' },
    multiplier: 1.12,
  };
}

export function eventApplies(event: YearEvent, asset: Asset): boolean {
  if (event.appliesTo.kind === 'asset') return event.appliesTo.assetId === asset.id;
  return event.appliesTo.sector === asset.sector;
}

