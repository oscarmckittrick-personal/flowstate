export type Cell = {
  x: number;
  y: number;
};

export type Segment = {
  id: string;
  cells: Cell[];
};

export type PathsByColor = Record<string, Segment[]>;

export type PathsPayload = Array<{
  color: string;
  segments: Array<{ id: string; cells: number[] }>;
}>;

export type DragPreviewSession = {
  color: string;
  path: Cell[];
  axis: 'x' | 'y' | null;
  locked: boolean;
  hasMoved: boolean;
};

export type DragActive = {
  color: string;
  id: string;
};

export type DragState = {
  active: DragActive | null;
  start: Cell | null;
  last: Cell | null;
};

export type DotPoint = {
  x: number;
  y: number;
  color: string;
};

export type OpenBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export const cellKey = (x: number, y: number) => `${x},${y}`;
