/**
 * types.ts — Data model for the board cutting optimizer.
 */

export interface DefectRect {
  x: number;
  y: number;
  width: number;
  length: number;
}

export interface StockBoardInput {
  boardId: string;
  species: string;
  thicknessIn: number;
  widthIn: number;
  lengthIn: number;
  grainDirection: 'vertical' | 'horizontal' | 'any';
  defects: DefectRect[];
  edgeCondition: 'clean' | 'rough' | 'wane';
  location?: string;
}

export interface CutPartInput {
  partId: string;
  partName: string;
  quantity: number;
  species: string;
  thicknessIn: number;
  widthIn: number;
  lengthIn: number;
  grainDirection: 'vertical' | 'horizontal' | 'any';
  rotationAllowed: boolean;
  edgeRequirement: 'none' | 'one-clean' | 'two-clean';
  notes?: string;
}

export interface CutSettings {
  /** Saw kerf in inches (consumed by every cut). */
  kerf: number;
  /** Trim allowance trimmed from each end of a part (inches, total). */
  trimAllowance: number;
  /** Jointing allowance added to each edge (inches, per edge). */
  jointingAllowance: number;
  /** Planing allowance added to thickness handling (inches, per face). */
  planingAllowance: number;
  /** Minimum offcut worth keeping (inches). */
  minOffcut: number;
  /** When true, parts with an edge requirement cannot be rotated. */
  grainConstraint: boolean;
}

export type CutStrategy = 'max-yield' | 'min-waste' | 'min-cuts' | 'grain-priority' | 'balanced';

export const CUT_STRATEGIES: CutStrategy[] = ['max-yield', 'min-waste', 'min-cuts', 'grain-priority', 'balanced'];

export interface Rect {
  x: number; // along board length
  y: number; // across board width
  w: number; // width (across)
  l: number; // length (along)
}

export interface PlacedPart {
  partId: string;
  partName: string;
  rect: Rect;
  rotated: boolean;
  /** Net size after allowances, before kerf. */
  netWidth: number;
  netLength: number;
}

export interface CutStep {
  type: 'crosscut' | 'rip';
  at: number; // position along the cut axis
  from: number;
  to: number;
  partId?: string;
  label: string;
}

export interface BoardLayout {
  board: StockBoardInput;
  placements: PlacedPart[];
  usableArea: number;
  usedArea: number;
  wasteArea: number;
  yieldPct: number;
  cutCount: number;
  score: number;
  cutSequence: CutStep[];
  freeRects: Rect[];
  explanation: string[];
}

export interface UnplacedPart {
  partId: string;
  partName: string;
  quantity: number;
  widthIn: number;
  lengthIn: number;
  reason: string;
}

export interface LayoutResult {
  strategy: CutStrategy;
  settings: CutSettings;
  layouts: BoardLayout[];
  unplaced: UnplacedPart[];
  totalRequiredArea: number;
  totalUsedArea: number;
  totalBoardArea: number;
  totalWasteArea: number;
  totalYieldPct: number;
  placedQuantity: number;
  totalRequiredQuantity: number;
}
