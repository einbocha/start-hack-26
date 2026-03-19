'use client';

import { diversificationHint, investedValue, netWorth, totalPnL } from '../../game/portfolio';
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
  const invested = investedValue(state.assets);
  const worth = netWorth(state);
  const pnl = totalPnL(state);
  const pnlColor = pnl >= 0 ? 'rgba(120,255,180,0.95)' : 'rgba(255,140,140,0.95)';
  const hint = diversificationHint(state.assets);

  const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const fmtPct = (n: number) =>
    `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

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

