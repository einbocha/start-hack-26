'use client';

import { Asset } from '../../game/types';
import { cityDisplayNameForAsset } from '../lib/cityBuildingAliases';

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
  onBuy,
  onSell,
  cash,
  relatedSectorEtf,
  onSelectRelatedSectorEtf,
  relatedCountryEtf,
  onSelectRelatedCountryEtf,
  uiMode,
}: {
  asset: Asset;
  uiMode: 'city' | 'stocks';
  cash: number;
  onBuy: (qty: number) => void;
  onSell: (qty: number) => void;
  relatedSectorEtf?: { id: string; displayName: string } | null;
  onSelectRelatedSectorEtf?: (id: string) => void;
  relatedCountryEtf?: { id: string; displayName: string } | null;
  onSelectRelatedCountryEtf?: (id: string) => void;
}) {
  const canBuy1 = cash >= asset.currentPrice && asset.unlocked;
  const canBuy5 = cash >= asset.currentPrice * 5 && asset.unlocked;
  const canSell1 = asset.sharesOwned >= 1 && asset.unlocked;
  const canSell5 = asset.sharesOwned >= 5 && asset.unlocked;

  const valueOwned = asset.sharesOwned * asset.currentPrice;
  const trend = trendArrow(asset);

  const isProperty = asset.type === 'property';
  const panelTitle = uiMode === 'city' ? cityDisplayNameForAsset(asset) : asset.displayName;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <div style={{ fontSize: 16, fontWeight: 900 }}>{panelTitle}</div>
        {trend && <div style={{ fontWeight: 900, color: trend.color }}>{trend.label}</div>}
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: 'rgba(255,255,255,0.72)' }}>
        {asset.type.toUpperCase()} • {asset.market} • {asset.sector} • {asset.symbol}
      </div>

      {!asset.unlocked && (
        <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
          {isProperty ? 'Private property: not buyable.' : 'Locked for now. Keep playing—new buildings unlock later.'}
        </div>
      )}

      <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 13 }}>
        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Current price</div>
        <div style={{ fontWeight: 800 }}>{fmt(asset.currentPrice)}</div>

        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Volatility</div>
        <div style={{ fontWeight: 800 }}>{asset.volatilityLabel}</div>

        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Shares owned</div>
        <div style={{ fontWeight: 800 }}>{asset.sharesOwned}</div>

        <div style={{ color: 'rgba(255,255,255,0.6)' }}>Value owned</div>
        <div style={{ fontWeight: 800 }}>{fmt(valueOwned)}</div>
      </div>

      {/* Intentionally omit the long educational text so the popup stays compact. */}

      {isProperty ? (
        <>
          <div
            style={{
              marginTop: 14,
              fontSize: 12,
              color: 'rgba(255,255,255,0.78)',
              lineHeight: 1.45,
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 6 }}>Non-business building</div>
            <div>It doesn’t generate stock value, so there’s nothing to buy or sell.</div>
          </div>

          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {asset.type !== 'etf' && relatedSectorEtf && onSelectRelatedSectorEtf && (
              <button
                onClick={() => onSelectRelatedSectorEtf(relatedSectorEtf.id)}
                style={{
                  padding: '10px 10px',
                  borderRadius: 12,
                  border: '1px solid rgba(125,211,252,0.32)',
                  background: 'rgba(125,211,252,0.14)',
                  color: 'rgba(255,255,255,0.92)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Open {relatedSectorEtf.displayName}
              </button>
            )}

            {asset.type !== 'etf' && relatedCountryEtf && onSelectRelatedCountryEtf && (
              <button
                onClick={() => onSelectRelatedCountryEtf(relatedCountryEtf.id)}
                style={{
                  padding: '10px 10px',
                  borderRadius: 12,
                  border: '1px solid rgba(167,139,250,0.32)',
                  background: 'rgba(167,139,250,0.14)',
                  color: 'rgba(255,255,255,0.92)',
                  fontWeight: 900,
                  cursor: 'pointer',
                }}
              >
                Open {relatedCountryEtf.displayName}
              </button>
            )}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        {asset.type === 'stock' && relatedSectorEtf && onSelectRelatedSectorEtf && (
          <button
            onClick={() => onSelectRelatedSectorEtf(relatedSectorEtf.id)}
            style={{
              padding: '10px 10px',
              borderRadius: 12,
              border: '1px solid rgba(125,211,252,0.32)',
              background: 'rgba(125,211,252,0.14)',
              color: 'rgba(255,255,255,0.92)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Open {relatedSectorEtf.displayName}
          </button>
        )}

        {asset.type === 'stock' && relatedCountryEtf && onSelectRelatedCountryEtf && (
          <button
            onClick={() => onSelectRelatedCountryEtf(relatedCountryEtf.id)}
            style={{
              padding: '10px 10px',
              borderRadius: 12,
              border: '1px solid rgba(167,139,250,0.32)',
              background: 'rgba(167,139,250,0.14)',
              color: 'rgba(255,255,255,0.92)',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            Open {relatedCountryEtf.displayName}
          </button>
        )}

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
      )}
    </div>
  );
}

