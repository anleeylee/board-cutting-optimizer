import { describe, expect, it } from 'vitest';
import {
  planLayouts,
  subtractRect,
  placeWithSplit,
  packBoard,
  resolveCutOrientation,
  boardCompatible,
} from '../src/features/layout/guillotine';
import type { CutPartInput, CutSettings, StockBoardInput } from '../src/features/layout/types';

const settings: CutSettings = {
  kerf: 0.125,
  trimAllowance: 0,
  jointingAllowance: 0,
  planingAllowance: 0,
  minOffcut: 2,
  grainConstraint: false,
};

function board(overrides: Partial<StockBoardInput> = {}): StockBoardInput {
  return { boardId: 'B1', species: 'Black Walnut', thicknessIn: 2, widthIn: 12, lengthIn: 96, grainDirection: 'any', defects: [], edgeCondition: 'clean', ...overrides };
}

function part(overrides: Partial<CutPartInput> = {}): CutPartInput {
  return {
    partId: 'P1',
    partName: 'Part',
    quantity: 1,
    species: 'Black Walnut',
    thicknessIn: 2,
    widthIn: 6,
    lengthIn: 20,
    grainDirection: 'any',
    rotationAllowed: true,
    edgeRequirement: 'none',
    notes: '',
    ...overrides,
  };
}

describe('defect subtraction', () => {
  it('splits a free rect around a defect', () => {
    const free = [{ x: 0, y: 0, w: 12, l: 96 }];
    const out = subtractRect(free, { x: 40, y: 2, w: 4, l: 8 });
    // left 40, right 48, bottom 2, top 6 -> 4 rects
    expect(out.length).toBe(4);
    for (const r of out) {
      expect(r.x).toBeGreaterThanOrEqual(0);
      expect(r.x + r.l).toBeLessThanOrEqual(96);
    }
  });

  it('keeps non-overlapping rects untouched', () => {
    const free = [{ x: 0, y: 0, w: 12, l: 96 }];
    const out = subtractRect(free, { x: -10, y: -10, w: 2, l: 2 });
    expect(out).toHaveLength(1);
  });
});

describe('guillotine placement', () => {
  it('splits into two strips and consumes kerf', () => {
    const free = [{ x: 0, y: 0, w: 12, l: 96 }];
    const out = placeWithSplit(free, free[0], 6, 20, 0.125, 2)!;
    // right strip 96-20-0.125 and top strip 12-6-0.125
    const areas = out.map((r) => r.l * r.w).sort((a, b) => a - b);
    expect(areas).toEqual([(12 - 6 - 0.125) * 20, (96 - 20 - 0.125) * 12].sort((a, b) => a - b));
  });

  it('rejects oversized parts', () => {
    const free = [{ x: 0, y: 0, w: 12, l: 96 }];
    expect(placeWithSplit(free, free[0], 30, 20, 0.125, 2)).toBeNull();
  });
});

describe('plan layouts', () => {
  it('places simple parts and computes yield', () => {
    const res = planLayouts([board()], [part({ widthIn: 6, lengthIn: 48 })], 'max-yield', settings);
    expect(res.placedQuantity).toBe(1);
    expect(res.unplaced).toHaveLength(0);
    const layout = res.layouts[0];
    expect(layout.usedArea).toBeCloseTo(6 * 48);
    expect(layout.yieldPct).toBeCloseTo((6 * 48) / (12 * 96) * 100);
  });

  it('respects quantities', () => {
    const res = planLayouts([board()], [part({ partId: 'A', widthIn: 6, lengthIn: 40, quantity: 2 })], 'max-yield', settings);
    // 2 × (6×40) = 480 fits in 12×96=1152; kerf between them
    expect(res.placedQuantity).toBe(2);
    expect(res.unplaced).toHaveLength(0);
  });

  it('respects kerf: parts that barely fit without kerf need another board', () => {
    const res = planLayouts(
      [board({ boardId: 'B1', lengthIn: 100 }), board({ boardId: 'B2', lengthIn: 100 })],
      [part({ partId: 'A', widthIn: 10, lengthIn: 50 }), part({ partId: 'B', widthIn: 10, lengthIn: 50 })],
      'max-yield',
      settings,
    );
    // 50+50+0.125 = 100.125 > 100 → two boards
    expect(res.layouts.length).toBe(2);
  });

  it('does not place parts on defect zones', () => {
    const res = planLayouts(
      [board({ boardId: 'B1', widthIn: 8, lengthIn: 40, defects: [{ x: 0, y: 0, width: 8, length: 20 }] })],
      [part({ partId: 'A', widthIn: 4, lengthIn: 15 })],
      'max-yield',
      settings,
    );
    // the whole left half is a defect; the part must land in the right half
    const layout = res.layouts[0];
    expect(layout.placements).toHaveLength(1);
    expect(layout.placements[0].rect.x).toBeGreaterThanOrEqual(20);
  });

  it('reports unplaced parts with a reason', () => {
    const res = planLayouts([board({ widthIn: 6 })], [part({ widthIn: 10, lengthIn: 10 })], 'max-yield', settings);
    expect(res.unplaced).toHaveLength(1);
    expect(res.unplaced[0].reason).toContain('wider');
  });

  it('grain: vertical parts are never rotated', () => {
    const orient = resolveCutOrientation(part({ grainDirection: 'vertical', widthIn: 8, lengthIn: 5 }), settings);
    expect(orient).toHaveLength(1);
    expect(orient[0].rotated).toBe(false);
  });

  it('grain constraint forbids rotation of edged parts', () => {
    const withConstraint = { ...settings, grainConstraint: true };
    const orient = resolveCutOrientation(part({ edgeRequirement: 'two-clean', widthIn: 8, lengthIn: 5 }), withConstraint);
    expect(orient).toHaveLength(1);
    expect(orient[0].rotated).toBe(false);
  });

  it('thickness mismatch blocks a board', () => {
    expect(boardCompatible(board({ thicknessIn: 2 }), part({ thicknessIn: 1 }))).toContain('thickness');
    expect(boardCompatible(board({ thicknessIn: 2 }), part({ thicknessIn: 2 }))).toBeNull();
  });

  it('all strategies return consistent totals', () => {
    const parts = [part({ partId: 'A', widthIn: 6, lengthIn: 40 }), part({ partId: 'B', widthIn: 4, lengthIn: 30, quantity: 2 })];
    for (const strategy of ['max-yield', 'min-waste', 'min-cuts', 'grain-priority', 'balanced'] as const) {
      const res = planLayouts([board()], parts, strategy, settings);
      expect(res.placedQuantity).toBe(3);
      expect(res.unplaced).toHaveLength(0);
    }
  });

  it('packBoard returns failed items for the next board', () => {
    const { failed } = packBoard(board({ lengthIn: 20 }), [{ part: part({ lengthIn: 30 }), pw: 6, pl: 30, rotated: false }], settings);
    expect(failed).toHaveLength(1);
  });
});
