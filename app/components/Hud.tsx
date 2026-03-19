'use client';

import { useState } from 'react';
import { diversificationHint, holdingValue, investedValue, netWorth, totalPnL } from '../../game/portfolio';
import { GameState } from '../../game/types';

export function Hud({
  state,
  onNextYear,
  onToggleMode,
}: {
  state: GameState;
  onNextYear: () => void;
  onToggleMode: () => void;
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
      <div
        style={{
          position: 'absolute',
          top: '16px',
          left: '16px',
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
            City Portfolio
          </div>
          <div style={{ fontWeight: 700, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Year {state.year}</div>
        </div>

        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 13 }}>
          <div style={{ color: 'rgba(255,255,255,0.6)' }}>Year</div>
          <div style={{ fontWeight: 700 }}>{state.year}</div>

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
            <span>My Stocks</span>
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
                  return (
                    <div
                      key={asset.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto',
                        gap: '2px 8px',
                        padding: '5px 6px',
                        borderRadius: 6,
                        background: 'rgba(255,255,255,0.05)',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700, color: 'rgba(255,255,255,0.9)' }}>
                        {asset.symbol}
                      </div>
                      <div style={{ fontWeight: 700, color: ratioColor, textAlign: 'right' }}>
                        {ratio >= 0 ? '+' : ''}{fmtPct(ratio)}
                      </div>
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
        <div
          style={{
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
          }}
        >
          Inflation&nbsp;{fmtPct(state.inflationRate)}
        </div>

        <button
          onClick={onNextYear}
          style={{
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
          }}
        >
          Advance 1 Year
        </button>
      </div>

      <button
        onClick={onToggleMode}
        title="Toggle City / Stocks (Space)"
        style={{
          position: 'absolute',
          top: '108px',
          right: '16px',
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
    </>
  );
}

