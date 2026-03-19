'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import { diversificationHint, holdingValue, investedValue, netWorth, totalPnL } from '../../game/portfolio';
import { GameState, ScriptedEvent } from '../../game/types';
import { cityDisplayNameForAsset } from '../lib/cityBuildingAliases';

type EventVisualKind = 'neutral' | 'negative' | 'info';

function eventBubblePalette(kind: EventVisualKind) {
  switch (kind) {
    case 'neutral':
      return {
        dot: 'rgba(120,255,180,0.95)',
        bg: 'rgba(120,255,180,0.10)',
        border: 'rgba(120,255,180,0.52)',
        text: 'rgba(240,255,248,0.95)',
        subtext: 'rgba(214,255,232,0.75)',
      };
    case 'negative':
      return {
        dot: 'rgba(255,140,140,0.95)',
        bg: 'rgba(255,90,90,0.17)',
        border: 'rgba(255,120,120,0.68)',
        text: 'rgba(255,245,245,0.95)',
        subtext: 'rgba(255,210,210,0.75)',
      };
    case 'info':
      return {
        dot: 'rgba(147,197,253,0.95)',
        bg: 'rgba(96,165,250,0.14)',
        border: 'rgba(147,197,253,0.58)',
        text: 'rgba(246,248,255,0.95)',
        subtext: 'rgba(220,225,255,0.75)',
      };
  }
}

function eventMoves(event: ScriptedEvent) {
  const n = Math.max(event.values.length, event.symbols.length, event.assets.length);
  const out: Array<{ label: string; value: number }> = [];
  for (let i = 0; i < n; i++) {
    const value = event.values[i] ?? 1;
    const label = event.symbols[i] ?? event.assets[i] ?? `Item ${i + 1}`;
    out.push({ label, value });
  }
  return out;
}

function EventNotificationBubble({ event }: { event: ScriptedEvent }) {
  const kind: EventVisualKind =
    event.seriousness === 'info'
      ? 'info'
      : event.seriousness === 'negative'
        ? 'negative'
        : 'neutral';
  const p = eventBubblePalette(kind);
  const moves = eventMoves(event).slice(0, 6);
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
            {event.seriousness === 'info' ? 'Tutorial Notice' : 'Market Event'}
          </div>
          <div style={{ marginTop: 2, fontWeight: 800, fontSize: 12, color: p.subtext, lineHeight: 1.25 }}>{event.text}</div>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {moves.map((m, idx) => {
              const pct = (m.value - 1) * 100;
              const up = pct > 0;
              const down = pct < 0;
              const color = up ? 'rgba(120,255,180,0.95)' : down ? 'rgba(255,140,140,0.95)' : 'rgba(226,232,240,0.9)';
              const arrow = up ? '▲' : down ? '▼' : '•';
              return (
                <span
                  key={`${event.id}-${idx}-${m.label}`}
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    color,
                    background: 'rgba(15,23,42,0.42)',
                    border: '1px solid rgba(148,163,184,0.35)',
                    borderRadius: 999,
                    padding: '2px 7px',
                  }}
                >
                  {m.label} {arrow} {Math.abs(pct).toFixed(1)}%
                </span>
              );
            })}
          </div>
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
  debugSelectedBuildingFileName,
  onSellAll,
  children,
}: {
  state: GameState;
  onNextYear: () => void;
  onToggleMode: () => void;
  onSelectAsset: (assetId: string) => void;
  debugSelectedBuildingFileName?: string | null;
  onSellAll: (assetId: string, qty: number) => void;
  children?: ReactNode;
}) {
  const [stocksOpen, setStocksOpen] = useState(false);

  const invested = investedValue(state.assets);
  const worth = netWorth(state);
  const pnl = totalPnL(state);
  const pnlColor = pnl >= 0 ? 'rgba(120,255,180,0.95)' : 'rgba(255,140,140,0.95)';
  const hint = diversificationHint(state.assets);
  const visibleEvents = useMemo(() => state.activeEvents, [state.activeEvents]);
  const severeEvent = visibleEvents.find((e) => e.seriousness === 'serious' || e.seriousness === 'timed') ?? null;
  const bubbleEvents = visibleEvents.filter((e) => e.seriousness !== 'serious' && e.seriousness !== 'timed');
  const topInset = severeEvent ? 56 : 16;
  const [timedRemainingMs, setTimedRemainingMs] = useState(20_000);
  const [severeMoving, setSevereMoving] = useState(false);
  const [severeDocked, setSevereDocked] = useState(false);
  useEffect(() => {
    if (!severeEvent || severeEvent.seriousness !== 'timed') return;
    const start = Date.now();
    setTimedRemainingMs(20_000);
    const t = window.setInterval(() => {
      const elapsed = Date.now() - start;
      setTimedRemainingMs(Math.max(0, 20_000 - elapsed));
    }, 250);
    return () => window.clearInterval(t);
  }, [severeEvent?.id, severeEvent?.seriousness]);
  useEffect(() => {
    if (!severeEvent) {
      setSevereMoving(false);
      setSevereDocked(false);
      return;
    }
    setSevereMoving(false);
    setSevereDocked(false);
    // 1) hold in center, 2) move to right, 3) dock in stack.
    const move = window.setTimeout(() => setSevereMoving(true), 1000);
    const dock = window.setTimeout(() => setSevereDocked(true), 2050);
    return () => {
      window.clearTimeout(move);
      window.clearTimeout(dock);
    };
  }, [severeEvent?.id]);

  // Game-like compact formatting for UI only (keeps underlying calculations accurate).
  // Example: 5510 -> "5,5k"
  const fmt = (n: number) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? '-' : '';

    const formatCompact = (value: number, suffix: 'k' | 'm' | 'b') => {
      // Round to 1 decimal place for compact units.
      const rounded = Math.round(value * 10) / 10;
      const hasDecimal = Math.abs(rounded - Math.round(rounded)) > 1e-9;
      const s = rounded.toFixed(hasDecimal ? 1 : 0).replace('.', ',');
      return `${sign}${s}${suffix}`;
    };

    if (abs >= 1_000_000_000) return formatCompact(abs / 1_000_000_000, 'b');
    if (abs >= 1_000_000) return formatCompact(abs / 1_000_000, 'm');
    if (abs >= 1_000) return formatCompact(abs / 1_000, 'k');

    return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
  };
  const fmtPct = (n: number) =>
    `${(n * 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;

  const ownedAssets = Object.values(state.assets).filter((a) => a.sharesOwned > 0);

  return (
    <>
      {severeEvent && (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            pointerEvents: 'none',
            zIndex: 70,
          }}
        >
          <div
            style={{
              overflow: 'hidden',
              borderBottom: '1px solid rgba(248,113,113,0.65)',
              background: 'rgba(127,29,29,0.87)',
              color: 'rgba(254,226,226,0.95)',
              fontWeight: 900,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              whiteSpace: 'nowrap',
            }}
          >
            <div style={{ display: 'inline-block', padding: '8px 0', animation: 'eventTickerScroll 16s linear infinite' }}>
              {'BREAKING NEWS • ' + severeEvent.text + ' • '.repeat(6)}
            </div>
          </div>
        </div>
      )}

      {/* Left column — portfolio panel + anything passed as children stack here */}
      <div
        style={{
          position: 'absolute',
          top: `${topInset}px`,
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
              Overview
            </div>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>Year {state.year}</div>
          </div>

          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, fontSize: 13 }}>
            <div style={{ color: 'rgba(255,255,255,0.6)' }}>{state.uiMode === 'city' ? 'Available Coins' : 'Cash'}</div>
            <div style={{ fontWeight: 700 }}>{fmt(state.player.cash)}</div>

            <div style={{ color: 'rgba(255,255,255,0.6)' }}>
              {state.uiMode === 'city' ? 'Building Value' : 'Invested value'}
            </div>
            <div style={{ fontWeight: 700 }}>{fmt(invested)}</div>

            <div style={{ color: 'rgba(255,255,255,0.6)' }}>{state.uiMode === 'city' ? 'Total Coins' : 'Net worth'}</div>
            <div style={{ fontWeight: 800 }}>{fmt(worth)}</div>

            <div style={{ color: 'rgba(255,255,255,0.6)' }}>Gain / loss</div>
            <div style={{ fontWeight: 800, color: pnlColor }}>{pnl >= 0 ? '+' : ''}{fmt(pnl)}</div>
          </div>

          {hint && (
            <div style={{ marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>
              {hint}
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
              <span>{state.uiMode === 'city' ? 'My buildings' : 'My Stocks'}</span>
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
                          {state.uiMode === 'city' ? cityDisplayNameForAsset(asset) : asset.displayName}
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
          top: `${topInset}px`,
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

        {/* Active event bubbles */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', pointerEvents: 'none' }}>
          {severeEvent && severeDocked && (
            <div
              style={{
                width: 460,
                padding: '14px 16px',
                borderRadius: 18,
                border: '1px solid rgba(248,113,113,0.72)',
                background: 'rgba(127,29,29,0.76)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                color: 'rgba(255,241,242,0.98)',
                pointerEvents: 'none',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
                {severeEvent.seriousness === 'timed' ? 'Timed Event' : 'Serious Event'}
              </div>
              <div style={{ marginTop: 8, fontSize: 15, fontWeight: 900, lineHeight: 1.25 }}>{severeEvent.text}</div>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {eventMoves(severeEvent).slice(0, 8).map((m, idx) => {
                  const pct = (m.value - 1) * 100;
                  const up = pct > 0;
                  const down = pct < 0;
                  const color = up ? 'rgba(120,255,180,0.98)' : down ? 'rgba(255,140,140,0.98)' : 'rgba(226,232,240,0.95)';
                  const arrow = up ? '▲' : down ? '▼' : '•';
                  return (
                    <span
                      key={`${severeEvent.id}-dock-list-${idx}-${m.label}`}
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color,
                        border: '1px solid rgba(252,165,165,0.45)',
                        background: 'rgba(15,23,42,0.35)',
                        borderRadius: 999,
                        padding: '3px 8px',
                      }}
                    >
                      {m.label} {arrow} {Math.abs(pct).toFixed(1)}%
                    </span>
                  );
                })}
              </div>
              {severeEvent.seriousness === 'timed' && (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'rgba(254,202,202,0.92)',
                    }}
                  >
                    Incoming auto-advance
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 24,
                      lineHeight: 1,
                      fontWeight: 950,
                      color: 'rgba(252,165,165,0.98)',
                      textShadow: '0 0 10px rgba(248,113,113,0.45)',
                      animation: 'countdownPulse 700ms ease-in-out infinite',
                      transformOrigin: 'left center',
                    }}
                  >
                    {String(Math.ceil(timedRemainingMs / 1000)).padStart(2, '0')}s
                  </div>
                </div>
              )}
            </div>
          )}

          {bubbleEvents.map((event) => (
            <EventNotificationBubble key={event.id} event={event} />
          ))}
        </div>
      </div>

      {severeEvent && (
        <>
          <style>{`
            @keyframes eventTickerScroll {
              0% { transform: translateX(100%); }
              100% { transform: translateX(-100%); }
            }
            @keyframes countdownPulse {
              0% { transform: scale(1); opacity: 0.92; }
              50% { transform: scale(1.07); opacity: 1; }
              100% { transform: scale(1); opacity: 0.92; }
            }
          `}</style>
        </>
      )}
      {severeEvent && !severeDocked && (
        <div
          style={{
            position: 'fixed',
            left: severeMoving ? 'calc(100vw - 16px - 460px)' : '50%',
            top: severeMoving ? `${topInset + 52}px` : '50%',
            width: severeMoving ? '460px' : 'min(760px, 90vw)',
            padding: severeMoving ? '14px 16px' : '20px 22px',
            borderRadius: 18,
            border: '1px solid rgba(248,113,113,0.72)',
            background: 'rgba(127,29,29,0.76)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
            boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
            color: 'rgba(255,241,242,0.98)',
            pointerEvents: 'none',
            zIndex: 9998,
            transform: severeMoving ? 'translate(0, 0)' : 'translate(-50%, -50%)',
            transition:
              'left 1050ms cubic-bezier(0.22, 1, 0.36, 1), top 1050ms cubic-bezier(0.22, 1, 0.36, 1), width 1050ms cubic-bezier(0.22, 1, 0.36, 1), padding 1050ms cubic-bezier(0.22, 1, 0.36, 1), transform 1050ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {severeEvent.seriousness === 'timed' ? 'Timed Event' : 'Serious Event'}
          </div>
          <div style={{ marginTop: 8, fontSize: severeMoving ? 15 : 20, fontWeight: 900, lineHeight: 1.25, transition: 'font-size 1050ms cubic-bezier(0.22, 1, 0.36, 1)' }}>
            {severeEvent.text}
          </div>
          {severeMoving && (
            <>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {eventMoves(severeEvent).slice(0, 8).map((m, idx) => {
                  const pct = (m.value - 1) * 100;
                  const up = pct > 0;
                  const down = pct < 0;
                  const color = up ? 'rgba(120,255,180,0.98)' : down ? 'rgba(255,140,140,0.98)' : 'rgba(226,232,240,0.95)';
                  const arrow = up ? '▲' : down ? '▼' : '•';
                  return (
                    <span
                      key={`${severeEvent.id}-dock-${idx}-${m.label}`}
                      style={{
                        fontSize: 11,
                        fontWeight: 900,
                        color,
                        border: '1px solid rgba(252,165,165,0.45)',
                        background: 'rgba(15,23,42,0.35)',
                        borderRadius: 999,
                        padding: '3px 8px',
                      }}
                    >
                      {m.label} {arrow} {Math.abs(pct).toFixed(1)}%
                    </span>
                  );
                })}
              </div>
              {severeEvent.seriousness === 'timed' && (
                <div style={{ marginTop: 10 }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 900,
                      letterSpacing: '0.12em',
                      textTransform: 'uppercase',
                      color: 'rgba(254,202,202,0.92)',
                    }}
                  >
                    Incoming auto-advance
                  </div>
                  <div
                    style={{
                      marginTop: 3,
                      fontSize: 24,
                      lineHeight: 1,
                      fontWeight: 950,
                      color: 'rgba(252,165,165,0.98)',
                      textShadow: '0 0 10px rgba(248,113,113,0.45)',
                      animation: 'countdownPulse 700ms ease-in-out infinite',
                      transformOrigin: 'left center',
                    }}
                  >
                    {String(Math.ceil(timedRemainingMs / 1000)).padStart(2, '0')}s
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
