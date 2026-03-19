'use client';

import { Asset } from '../../game/types';

function fmt(n: number) {
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function trendArrow(asset: Asset): { label: string; color: string } | null {
  const h = asset.priceHistory;
  if (h.length < 2) return null;
  const prev = h[h.length - 2].price;
  const cur = h[h.length - 1].price;
  const chg = (cur - prev) / prev;
  const label = `${chg >= 0 ? '▲' : '▼'} ${(chg * 100).toFixed(1)}%`;
  const color = chg >= 0 ? 'rgba(120,255,180,0.95)' : 'rgba(255,140,140,0.95)';
  return { label, color };
}

export function AssetPanel({
  asset,
  onClose,
  onBuy,
  onSell,
  cash,
}: {
  asset: Asset;
  cash: number;
  onClose: () => void;
  onBuy: (qty: number) => void;
  onSell: (qty: number) => void;
}) {
  const canBuy1 = cash >= asset.currentPrice && asset.unlocked;
  const canBuy5 = cash >= asset.currentPrice * 5 && asset.unlocked;
  const canSell1 = asset.sharesOwned >= 1 && asset.unlocked;
  const canSell5 = asset.sharesOwned >= 5 && asset.unlocked;

  const valueOwned = asset.sharesOwned * asset.currentPrice;
  const trend = trendArrow(asset);

  const explain = {
    volatility: 'Volatility: this price can swing up and down from year to year.',
    etf: 'ETF: a bundle of many assets—less single-company risk.',
    sector: 'Sector: companies grouped by industry (tech, healthcare, finance…).',
    market: 'Market: the region where the asset mainly operates.',
  } as const;

  return (
    <div
      style={{
        width: 320,
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: 16,
        padding: '18px 18px',
        color: 'rgba(255,255,255,0.92)',
        pointerEvents: 'auto',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 10,
          right: 10,
          background: 'none',
          border: 'none',
          color: 'rgba(255,255,255,0.7)',
          fontSize: '1.1rem',
          cursor: 'pointer',
          lineHeight: 1,
          padding: '2px 6px',
        }}
        aria-label="Close"
      >
        ×
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>{asset.displayName}</div>
        {trend && <div style={{ fontWeight: 900, color: trend.color }}>{trend.label}</div>}
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
        {asset.type.toUpperCase()} • {asset.market} • {asset.sector}
      </div>

      {!asset.unlocked && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
          Locked for now. Keep playing—new buildings unlock later.
        </div>
      )}

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 13 }}>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Current price</div>
        <div style={{ fontWeight: 800 }}>{fmt(asset.currentPrice)}</div>

        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Volatility</div>
        <div style={{ fontWeight: 800 }}>{asset.volatilityLabel}</div>

        <div style={{ color: 'rgba(255,255,255,0.6)' }}>P/E ratio</div>
        <div style={{ fontWeight: 800 }}>{asset.peRatio === 0 ? '—' : asset.peRatio}</div>

        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Shares owned</div>
        <div style={{ fontWeight: 800 }}>{asset.sharesOwned}</div>

        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Value owned</div>
        <div style={{ fontWeight: 800 }}>{fmt(valueOwned)}</div>
      </div>

      <div style={{ marginTop: 12, fontSize: 12, color: 'rgba(255,255,255,0.78)', lineHeight: 1.4 }}>
        {asset.description}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.35 }}>
        <div>{explain.volatility}</div>
        {asset.type === 'etf' && <div style={{ marginTop: 6 }}>{explain.etf}</div>}
        <div style={{ marginTop: 6 }}>{explain.sector}</div>
        <div style={{ marginTop: 6 }}>{explain.market}</div>
      </div>

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <button
          disabled={!canBuy1}
          onClick={() => onBuy(1)}
          style={{
            padding: '10px 10px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.18)',
            background: canBuy1 ? 'rgba(120,255,180,0.18)' : 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.92)',
            fontWeight: 800,
            cursor: canBuy1 ? 'pointer' : 'not-allowed',
          }}
        >
          Buy 1
        </button>
        <button
          disabled={!canSell1}
          onClick={() => onSell(1)}
          style={{
            padding: '10px 10px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.18)',
            background: canSell1 ? 'rgba(255,140,140,0.16)' : 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.92)',
            fontWeight: 800,
            cursor: canSell1 ? 'pointer' : 'not-allowed',
          }}
        >
          Sell 1
        </button>

        <button
          disabled={!canBuy5}
          onClick={() => onBuy(5)}
          style={{
            padding: '10px 10px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.18)',
            background: canBuy5 ? 'rgba(120,255,180,0.12)' : 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.92)',
            fontWeight: 800,
            cursor: canBuy5 ? 'pointer' : 'not-allowed',
          }}
        >
          Buy 5
        </button>
        <button
          disabled={!canSell5}
          onClick={() => onSell(5)}
          style={{
            padding: '10px 10px',
            borderRadius: 12,
            border: '1px solid rgba(255,255,255,0.18)',
            background: canSell5 ? 'rgba(255,140,140,0.12)' : 'rgba(255,255,255,0.06)',
            color: 'rgba(255,255,255,0.92)',
            fontWeight: 800,
            cursor: canSell5 ? 'pointer' : 'not-allowed',
          }}
        >
          Sell 5
        </button>
      </div>
    </div>
  );
}

