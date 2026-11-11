import type { AppState, Property } from '../data/types';

// Levels unlock as the owner adds detail to a property. Nothing is required beyond Bronze;
// each level makes the numbers more complete. Levels are per property.

export type Level = 'bronze' | 'silver' | 'gold';

export const LEVELS: { id: Level; name: string; rank: 1 | 2 | 3; needs: string; gives: string }[] = [
  { id: 'bronze', name: 'Bronze', rank: 1, needs: 'The property, your tenants and their rent', gives: 'Rent tracking, receipts, expenses, a tax summary and a rough idea of what you earn' },
  { id: 'silver', name: 'Silver', rank: 2, needs: 'What you paid and when', gives: "Your gain since buying, return vs savings and a GIC, rent vs the area, room to borrow, a monthly value check and a rough sale figure" },
  { id: 'gold', name: 'Gold', rank: 3, needs: 'Your mortgage and purchase costs', gives: 'Mortgage tracking, full taxes with depreciation, and your gain if you sold' },
];

export const levelInfo = (l: Level) => LEVELS.find((x) => x.id === l)!;

export function hasSilver(p: Property): boolean {
  return !!p.purchasePrice && !!p.purchaseDate;
}

export function hasGold(state: AppState, p: Property): boolean {
  const mortgageKnown = p.mortgageFree || state.mortgages.some((m) => m.propertyId === p.id);
  return hasSilver(p) && mortgageKnown && p.closingCosts !== undefined && p.landTransferTax !== undefined;
}

export function propertyLevel(state: AppState, p: Property): Level {
  if (hasGold(state, p)) return 'gold';
  if (hasSilver(p)) return 'silver';
  return 'bronze';
}

export const atLeast = (have: Level, need: Level) => levelInfo(have).rank >= levelInfo(need).rank;

/** The single next thing to suggest for a property, in plain words. Null when it is Gold. */
export function nextStep(state: AppState, p: Property): { to: Level; title: string; why: string; action: string } | null {
  const l = propertyLevel(state, p);
  if (l === 'bronze') return { to: 'silver', title: `Add what you paid for ${p.nickname}`, why: "See your gain since buying, rent vs the area and room to borrow.", action: 'Add what I paid' };
  if (l === 'silver') return { to: 'gold', title: `Add the mortgage for ${p.nickname}`, why: 'Track the mortgage and get full tax numbers with depreciation.', action: 'Add mortgage details' };
  return null;
}
