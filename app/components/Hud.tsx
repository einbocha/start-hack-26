'use client';

import { ReactNode, useState } from 'react';
import { diversificationHint, holdingValue, investedValue, netWorth, totalPnL } from '../../game/portfolio';
import { GameState } from '../../game/types';

type EventImpact = 'up' | 'down' | 'neutral';
type EventBubble = {
  id: string;
  tag: string;
  title: string;
  detail: string;
  impact: EventImpact;
};

function eventBubblePalette(impact: EventImpact) {
  switch (impact) {
    case 'up':
      return {
        dot: 'rgba(120,255,180,0.95)',
        bg: 'rgba(120,255,180,0.10)',
        border: 'rgba(120,255,180,0.52)',
        text: 'rgba(240,255,248,0.95)',
        subtext: 'rgba(214,255,232,0.75)',
      };
    case 'down':
      return {
        dot: 'rgba(255,140,140,0.95)',
        bg: 'rgba(255,140,140,0.10)',
        border: 'rgba(255,140,140,0.52)',
        text: 'rgba(255,245,245,0.95)',
        subtext: 'rgba(255,210,210,0.75)',
      };
    default:
      return {
        dot: 'rgba(180,190,255,0.95)',
        bg: 'rgba(180,190,255,0.10)',
        border: 'rgba(180,190,255,0.48)',
        text: 'rgba(246,248,255,0.95)',
        subtext: 'rgba(220,225,255,0.75)',
      };
  }
}

function EventNotificationBubble({ bubble }: { bubble: EventBubble }) {
  const p = eventBubblePalette(bubble.impact);
  return (
    <div
      style={{
        pointerEvents: 'none',
        padding: '10px 12px',
        borderRadius: 14,
        background: p.bg,
        border: `1px solid ${p.border}`,
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        color: p.text,
        boxShadow: '0 16px 34px rgba(0,0,0,0.22)',
        maxWidth: 320,
      }}
    >
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ width: 10, height: 10, borderRadius: 999, background: p.dot, marginTop: 4, flex: '0 0 auto' }} />
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              fontSize: 11,
              color: 'rgba(255,255,255,0.9)',
            }}
          >
            {bubble.tag}
          </div>
          <div style={{ marginTop: 2, fontWeight: 900, fontSize: 13, lineHeight: 1.2 }}>{bubble.title}</div>
          <div style={{ marginTop: 4, fontSize: 12, color: p.subtext, lineHeight: 1.25 }}>{bubble.detail}</div>
        </div>
      </div>
    </div>
  );
}

export function Hud({
  state,
  onNextYear,
  onToggleMode,
  onSelectAsset,
  onSellAll,
  children,
}: {
  state: GameState;
  onNextYear: () => void;
  onToggleMode: () => void;
  onSelectAsset: (assetId: string) => void;
  onSellAll: (assetId: string, qty: number) => void;
  children?: ReactNode;
}) {
  const [stocksOpen, setStocksOpen] = useState(false);

  const invested = investedValue(state.assets);
  const worth = netWorth(state);
  const pnl = totalPnL(state);
  const pnlColor = pnl >= 0 ? 'rgba(120,255,180,0.95)' : 'rgba(255,140,140,0.95)';
  const hint = diversificationHint(state.assets);

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const fmtPct = (n: number) =>
    `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

  const ownedAssets = Object.values(state.assets).filter((a) => a.sharesOwned > 0);

  return (
    <>
      {/* Left column — portfolio panel + anything passed as children stack here */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          pointerEvents: 'none',
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
        }}
      >
        {/* Portfolio panel */}
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.18)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            color: 'rgba(255,255,255,0.92)',
            pointerEvents: 'auto',
            minWidth: 260,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <div style={{ fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', fontSize: 12 }}>
              {state.uiMode === 'city' ? 'City Portfolio' : 'Stock Portfolio'}
            </div>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Year {state.year}</div>
          </div>

          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 13 }}>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Cash</div>
            <div style={{ fontWeight: 700 }}>{fmt(state.player.cash)}</div>

            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Invested value</div>
            <div style={{ fontWeight: 700 }}>{fmt(invested)}</div>

            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Net worth</div>
            <div style={{ fontWeight: 800 }}>{fmt(worth)}</div>

            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Gain / loss</div>
            <div style={{ fontWeight: 800, color: pnlColor }}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</div>
          </div>

          {hint && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
              {hint}
            </div>
          )}

          {state.lastActionMessage && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.82)' }}>
              {state.lastActionMessage}
            </div>
          )}

          {/* Stocks dropdown */}
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setStocksOpen((v) => !v)}
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'rgba(255,255,255,0.07)',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: 8,
                color: 'rgba(255,255,255,0.85)',
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
              }}
            >
              <span>{state.uiMode === 'city' ? 'My investements' : 'My Stocks'}</span>
              <span style={{ fontSize: 10 }}>{stocksOpen ? '▲' : '▼'}</span>
            </button>

            {stocksOpen && (
              <div
                style={{
                  marginTop: 6,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                }}
              >
                {ownedAssets.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', padding: '4px 2px' }}>
                    No positions yet.
                  </div>
                ) : (
                  ownedAssets.map((asset) => {
                    const value = holdingValue(asset);
                    const ratio =
                      asset.totalCostBasis > 0
                        ? (value - asset.totalCostBasis) / asset.totalCostBasis
                        : 0;
                    const ratioColor =
                      ratio >= 0 ? 'rgba(120,255,180,0.95)' : 'rgba(255,140,140,0.95)';
                    const isSelected = state.selectedAssetId === asset.id;
                    return (
                      <div
                        key={asset.id}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr auto auto',
                          gap: '2px 8px',
                          padding: '5px 6px',
                          borderRadius: 6,
                          background: isSelected ? 'rgba(125,211,252,0.14)' : 'rgba(255,255,255,0.05)',
                          border: isSelected ? '1px solid rgba(125,211,252,0.65)' : '1px solid rgba(255,255,255,0)',
                          fontSize: 12,
                          alignItems: 'center',
                          cursor: 'pointer',
                        }}
                        onClick={() => onSelectAsset(asset.id)}
                      >
                        <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                          {asset.symbol}
                        </div>
                        <div style={{ fontWeight: 700, color: ratioColor, textAlign: 'right' }}>
                          {ratio >= 0 ? '+' : ''}{fmtPct(ratio)}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSellAll(asset.id, asset.sharesOwned);
                          }}
                          style={{
                            gridRow: '1 / span 2',
                            gridColumn: 3,
                            padding: '3px 7px',
                            borderRadius: 5,
                            border: '1px solid rgba(255,100,100,0.5)',
                            background: 'rgba(255,80,80,0.15)',
                            color: 'rgba(255,160,160,0.95)',
                            fontSize: 11,
                            fontWeight: 700,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Sell all
                        </button>
                        <div style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {asset.sharesOwned} share{asset.sharesOwned !== 1 ? 's' : ''}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.75)', textAlign: 'right' }}>
                          {fmt(value)}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>

        {/* Asset panel (or any other children) rendered below portfolio panel */}
        {children}
      </div>

      {/* Right column — inflation badge + advance button */}
      <div
        style={{
          position: 'absolute',
          top: '16px',
          right: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          alignItems: 'flex-end',
          pointerEvents: 'none',
        }}
      >
        {/* Top row (left-to-right): City/Stock toggle, Advance, Inflation */}
        <div style={{ display: 'flex', flexDirection: 'row', gap: 8, alignItems: 'center', pointerEvents: 'none' }}>
          {/* City / Stock toggle */}
          <button
            onClick={onToggleMode}
            title="Toggle City / Stocks (Space)"
            style={{
              width: 44,
              height: 44,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.10)',
              color: 'rgba(255,255,255,0.95)',
              fontWeight: 900,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          >
            {state.uiMode === 'city' ? 'City' : 'Stock'}
          </button>

          <button
            onClick={onNextYear}
            style={{
              height: 44,
              padding: '12px 14px',
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.95)',
              fontWeight: 800,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Advance 1 Year
          </button>

          <div
            style={{
              height: 44,
              padding: '6px 10px',
              borderRadius: 999,
              background: 'rgba(15,23,42,0.78)',
              border: '1px solid rgba(148,163,184,0.7)',
              color: 'rgba(241,245,249,0.95)',
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              pointerEvents: 'auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            Inflation&nbsp;{fmtPct(state.inflationRate)}
          </div>
        </div>

        {/* Test event bubbles (UI only for now) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', pointerEvents: 'none' }}>
          {(
            [
              {
                id: 'demo-earnings',
                tag: 'Stock Event',
                title: 'Earnings Beat',
                detail: 'Stock prices up; trend momentum +3.1%',
                impact: 'up',
              },
              {
                id: 'demo-macro',
                tag: 'Market Event',
                title: 'Rate Volatility',
                detail: 'Prices jitter; trend uncertainty increases (-1.7% stability)',
                impact: 'down',
              },
            ] satisfies EventBubble[]
          ).map((bubble) => (
            <EventNotificationBubble key={bubble.id} bubble={bubble} />
          ))}
        </div>
      </div>
    </>
  );
}
