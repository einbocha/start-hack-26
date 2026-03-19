import { Asset, EventMode, EventSeriousness, ScriptedEvent } from './types';

type RawEvent = {
  text?: unknown;
  start_year?: unknown;
  end_year?: unknown;
  mode?: unknown;
  seriousness?: unknown;
  assets?: unknown;
  symbols?: unknown;
  values?: unknown;
};

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function parseMode(v: unknown): EventMode {
  if (v === 'city' || v === 'stock' || v === 'both') return v;
  return 'stock';
}

function parseSeriousness(v: unknown): EventSeriousness {
  if (v === 'neutral' || v === 'negative' || v === 'serious' || v === 'timed' || v === 'info') return v;
  return 'neutral';
}

function toStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean);
}

function toNumberArray(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'number' ? x : Number(x)))
    .filter((n) => Number.isFinite(n) && n > 0);
}

export function normalizeEventCatalog(raw: unknown): ScriptedEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: ScriptedEvent[] = [];
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i] as RawEvent;
    if (!e || typeof e !== 'object') continue;
    if (typeof e.text !== 'string') continue;
    const startYear = Number(e.start_year);
    const endYear = Number(e.end_year);
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) continue;
    out.push({
      id: `evt-${i}`,
      text: e.text.trim(),
      startYear,
      endYear,
      mode: parseMode(e.mode),
      seriousness: parseSeriousness(e.seriousness),
      assets: toStringArray(e.assets),
      symbols: toStringArray(e.symbols),
      values: toNumberArray(e.values),
    });
  }
  return out;
}

export function activeEventsForYear(catalog: ScriptedEvent[], year: number): ScriptedEvent[] {
  // Inclusive range on both sides.
  const active = catalog.filter((e) => year >= e.startYear && year <= e.endYear);

  const severe = active.filter((e) => e.seriousness === 'serious' || e.seriousness === 'timed');
  if (severe.length <= 1) return active;

  // Keep exactly one severe event at a time: earliest start, then earliest end, then stable id order.
  const keep = [...severe].sort(
    (a, b) => a.startYear - b.startYear || a.endYear - b.endYear || a.id.localeCompare(b.id),
  )[0];
  return active.filter((e) => (e.seriousness === 'serious' || e.seriousness === 'timed' ? e.id === keep.id : true));
}

type AssetIndex = {
  byId: Map<string, Asset>;
  bySymbol: Map<string, Asset>;
  byName: Map<string, Asset>;
};

function buildAssetIndex(assets: Record<string, Asset>): AssetIndex {
  const byId = new Map<string, Asset>();
  const bySymbol = new Map<string, Asset>();
  const byName = new Map<string, Asset>();
  for (const a of Object.values(assets)) {
    byId.set(normalize(a.id), a);
    bySymbol.set(normalize(a.symbol), a);
    byName.set(normalize(a.name), a);
    byName.set(normalize(a.displayName), a);
  }
  return { byId, bySymbol, byName };
}

function resolveEventAsset(index: AssetIndex, symbolOrName: string): Asset | null {
  const key = normalize(symbolOrName);
  const direct = index.bySymbol.get(key) ?? index.byName.get(key) ?? index.byId.get(key);
  if (direct) return direct;

  // Backward compatibility with old ETF labels/symbols in existing events.json.
  const legacyAliasToAssetId: Record<string, string> = {
    'technology etf': 'etf-Technology',
    'healthcare etf': 'etf-Healthcare',
    'finance etf': 'etf-Finance',
    'global equity etf': 'etf-Broad Market',
    'swiss market etf': 'etf-country-Switzerland',
    'bond etf': 'etf-Bonds',
    'tech-etf': 'etf-Technology',
    'hlth-etf': 'etf-Healthcare',
    'fin-etf': 'etf-Finance',
    'glb-etf': 'etf-Broad Market',
    'smi-etf': 'etf-country-Switzerland',
    'bond-etf': 'etf-Bonds',
    'usa-etf': 'etf-country-USA',
    'em-etf': 'etf-country-Emerging Markets',
  };
  const aliasTarget = legacyAliasToAssetId[key];
  if (!aliasTarget) return null;
  return index.byId.get(normalize(aliasTarget)) ?? null;
}

export function computeEventMultipliers(
  events: ScriptedEvent[],
  assets: Record<string, Asset>,
): Record<string, number> {
  const multByAssetId: Record<string, number> = {};
  const index = buildAssetIndex(assets);

  for (const e of events) {
    const width = Math.max(e.values.length, e.symbols.length, e.assets.length);
    for (let i = 0; i < width; i++) {
      const mult = e.values[i] ?? 1;
      const symbol = e.symbols[i] ?? '';
      const name = e.assets[i] ?? '';
      const target = resolveEventAsset(index, symbol) ?? resolveEventAsset(index, name);
      if (!target) continue;
      multByAssetId[target.id] = (multByAssetId[target.id] ?? 1) * mult;
    }
  }

  return multByAssetId;
}

