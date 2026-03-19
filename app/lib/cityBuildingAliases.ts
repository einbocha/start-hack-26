import { Asset } from '../../game/types';

function normalize(v: string) {
  return v.trim().toLowerCase();
}

const aliasByKey: Record<string, string> = {
  novartis: 'Hospital',
  pfizer: 'Factory',
  phizer: 'Factory',
  logitech: 'Retail Shop',
  postfinance: 'Post Office',
  apple: 'Highrise-Bar',
  'j.p. morgan': 'Bank',
  'jp morgan': 'Bank',
  tencent: 'Arcade',
  'zai lab': 'Asian Groceries Store',
  pfe: 'Factory',
  nvs: 'Hospital',
  aapl: 'Highrise-Bar',
  post: 'Post Office',
  jpm: 'Bank',
  tcehy: 'Arcade',
  zlab: 'Asian Groceries Store',
};

const etfAliasByKey: Record<string, string> = {
  qqq: 'Tech Basket',
  xlf: 'Money Movers',
  xlv: 'Care Collective',
  agg: 'Safe Bonds',
  vt: 'World Mix',
  spy: 'US Giants',
  ewl: 'Swiss Select',
  eem: 'Growth Globe',
  acwi: 'Global Blend',
  'invesco qqq trust': 'Tech Basket',
  'financial select sector spdr fund': 'Money Movers',
  'health care select sector spdr fund': 'Care Collective',
  'ishares core u.s. aggregate bond etf': 'Safe Bonds',
  'vanguard total world stock etf': 'World Mix',
  'spdr s&p 500 etf trust': 'US Giants',
  'ishares msci switzerland etf': 'Swiss Select',
  'ishares msci emerging markets etf': 'Growth Globe',
  'ishares msci acwi etf': 'Global Blend',
};

export function cityAliasForAsset(asset: Asset): string | null {
  if (asset.type !== 'stock') return null;
  const candidates = [asset.displayName, asset.name, asset.symbol].map(normalize);
  for (const key of candidates) {
    if (aliasByKey[key]) return aliasByKey[key];
  }
  return null;
}

export function cityDisplayNameForAsset(asset: Asset): string {
  const candidates = [asset.displayName, asset.name, asset.symbol].map(normalize);
  if (asset.type === 'stock') {
    for (const key of candidates) {
      if (aliasByKey[key]) return aliasByKey[key];
    }
    return asset.displayName;
  }
  if (asset.type === 'etf') {
    for (const key of candidates) {
      if (etfAliasByKey[key]) return etfAliasByKey[key];
    }
    return `${asset.sector} ETF`;
  }
  return asset.displayName;
}
