import { createStarterAssets } from './assets';
import { buy, sell } from './actions';
import { advanceOneYear } from './simulate';
import { netWorth } from './portfolio';
import { GameAction, GameState } from './types';

export function createInitialState(opts?: { startingCash?: number; seed?: number; year?: number }): GameState {
  const startingCash = opts?.startingCash ?? 10_000;
  const seed = opts?.seed ?? 26;
  const year = opts?.year ?? 2026;
  const assets = createStarterAssets();

  // Ensure starter history matches year.
  for (const a of Object.values(assets)) {
    a.priceHistory = [{ year, price: a.basePrice }];
    a.currentPrice = a.basePrice;
  }

  const baseState: GameState = {
    seed,
    year,
    player: { startingCash, cash: startingCash },
    assets,
    selectedAssetId: null,
    lastEvent: null,
    lastActionMessage: null,
    netWorthHistory: [],
    uiMode: 'city',
  };
  return {
    ...baseState,
    netWorthHistory: [{ year, price: netWorth(baseState) }],
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'SELECT_ASSET':
      return { ...state, selectedAssetId: action.assetId };
    case 'BUY':
      return buy(state, action.assetId, action.qty);
    case 'SELL':
      return sell(state, action.assetId, action.qty);
    case 'ADVANCE_YEAR':
      return advanceOneYear({ ...state, selectedAssetId: state.selectedAssetId });
    case 'TOGGLE_UI_MODE':
      return { ...state, uiMode: state.uiMode === 'city' ? 'stocks' : 'city' };
    case 'CLEAR_MESSAGE':
      return { ...state, lastActionMessage: null };
  }
}

