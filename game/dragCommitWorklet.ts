import type { Cell, DragPreviewSession, PathsByColor, Segment } from './dragTypes';

type DotColorByKey = Record<string, string | undefined>;

type CommitResult = {
  paths: PathsByColor;
  didChange: boolean;
  nextSegmentId: number;
};

const cellKey = (x: number, y: number) => {
  'worklet';
  return `${x},${y}`;
};

const clonePaths = (source: PathsByColor) => {
  'worklet';
  const next: PathsByColor = {};
  for (const color in source) {
    const segments = source[color];
    if (!segments || !segments.length) continue;
    const nextSegments: Segment[] = new Array(segments.length);
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const cells: Cell[] = new Array(segment.cells.length);
      for (let cellIndex = 0; cellIndex < segment.cells.length; cellIndex += 1) {
        const cell = segment.cells[cellIndex];
        cells[cellIndex] = { x: cell.x, y: cell.y };
      }
      nextSegments[index] = { id: segment.id, cells };
    }
    next[color] = nextSegments;
  }
  return next;
};

const removeSegment = (source: PathsByColor, color: string, segmentIndex: number) => {
  'worklet';
  const segments = source[color];
  if (!segments) return;
  segments.splice(segmentIndex, 1);
  if (!segments.length) {
    delete source[color];
  }
};

const removeSegmentsIntersecting = (source: PathsByColor, keys: Record<string, true>) => {
  'worklet';
  let removed = false;
  for (const color in source) {
    const segments = source[color];
    if (!segments || !segments.length) continue;
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const segment = segments[index];
      let hit = false;
      const cells = segment.cells;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        const cell = cells[cellIndex];
        if (keys[cellKey(cell.x, cell.y)]) {
          hit = true;
          break;
        }
      }
      if (hit) {
        removeSegment(source, color, index);
        removed = true;
      }
    }
  }
  return removed;
};

const removeSegmentsWithEndpoints = (source: PathsByColor, keys: Record<string, true>) => {
  'worklet';
  let removed = false;
  for (const color in source) {
    const segments = source[color];
    if (!segments || !segments.length) continue;
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const segment = segments[index];
      if (!segment.cells.length) continue;
      const first = segment.cells[0];
      const last = segment.cells[segment.cells.length - 1];
      const firstKey = cellKey(first.x, first.y);
      const lastKey = cellKey(last.x, last.y);
      if (keys[firstKey] || keys[lastKey]) {
        removeSegment(source, color, index);
        removed = true;
      }
    }
  }
  return removed;
};

const removeSegmentsAtEndpoint = (source: PathsByColor, endpointKey: string) => {
  'worklet';
  let removed = false;
  for (const color in source) {
    const segments = source[color];
    if (!segments || !segments.length) continue;
    for (let index = segments.length - 1; index >= 0; index -= 1) {
      const segment = segments[index];
      if (!segment.cells.length) continue;
      const first = segment.cells[0];
      const last = segment.cells[segment.cells.length - 1];
      const firstKey = cellKey(first.x, first.y);
      const lastKey = cellKey(last.x, last.y);
      if (firstKey === endpointKey || lastKey === endpointKey) {
        removeSegment(source, color, index);
        removed = true;
      }
    }
  }
  return removed;
};

const removeSegmentsWithColorInArea = (
  source: PathsByColor,
  color: string,
  areaId: number,
  areaByKey: Record<string, number | undefined>
) => {
  'worklet';
  const segments = source[color];
  if (!segments || !segments.length) return false;
  let removed = false;
  for (let index = segments.length - 1; index >= 0; index -= 1) {
    const segment = segments[index];
    if (!segment.cells.length) continue;
    const first = segment.cells[0];
    const last = segment.cells[segment.cells.length - 1];
    const firstKey = cellKey(first.x, first.y);
    const lastKey = cellKey(last.x, last.y);
    if (areaByKey[firstKey] === areaId || areaByKey[lastKey] === areaId) {
      removeSegment(source, color, index);
      removed = true;
    }
  }
  return removed;
};

export const commitDragWorklet = (
  paths: PathsByColor,
  session: DragPreviewSession,
  dotColorByKey: DotColorByKey,
  areaByKey: Record<string, number | undefined>,
  idSeed: number,
  nextSegmentId: number
): CommitResult => {
  'worklet';
  const path = session.path;
  if (!path.length) {
    return { paths, didChange: false, nextSegmentId };
  }

  const next = clonePaths(paths);
  const pathKeys: Record<string, true> = {};
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index];
    pathKeys[cellKey(cell.x, cell.y)] = true;
  }
  const start = path[0];
  const startKey = cellKey(start.x, start.y);
  const end = path[path.length - 1];
  const endKey = cellKey(end.x, end.y);
  const endpointKeys: Record<string, true> = {};
  if (dotColorByKey[startKey]) {
    endpointKeys[startKey] = true;
  }
  if (dotColorByKey[endKey]) {
    endpointKeys[endKey] = true;
  }
  const hasEndpointKeys = !!endpointKeys[startKey] || !!endpointKeys[endKey];
  const isTap = path.length === 1 && !session.hasMoved;
  let changed = false;

  if (isTap) {
    if (dotColorByKey[startKey]) {
      changed = removeSegmentsAtEndpoint(next, startKey) || changed;
    }
    return { paths: changed ? next : paths, didChange: changed, nextSegmentId };
  }

  if (path.length === 1) {
    return { paths, didChange: false, nextSegmentId };
  }

  const startArea =
    dotColorByKey[startKey] === session.color ? areaByKey[startKey] : undefined;
  if (startArea != null) {
    changed = removeSegmentsWithColorInArea(next, session.color, startArea, areaByKey) || changed;
  }
  const endArea = dotColorByKey[endKey] === session.color ? areaByKey[endKey] : undefined;
  if (endArea != null && endArea !== startArea) {
    changed = removeSegmentsWithColorInArea(next, session.color, endArea, areaByKey) || changed;
  }

  if (hasEndpointKeys) {
    changed = removeSegmentsWithEndpoints(next, endpointKeys) || changed;
  }
  changed = removeSegmentsIntersecting(next, pathKeys) || changed;

  const segmentId = `segment-${idSeed}-${nextSegmentId}`;
  nextSegmentId += 1;
  const cells: Cell[] = new Array(path.length);
  for (let index = 0; index < path.length; index += 1) {
    const cell = path[index];
    cells[index] = { x: cell.x, y: cell.y };
  }
  const segment: Segment = { id: segmentId, cells };
  const existing = next[session.color] ?? [];
  next[session.color] = [...existing, segment];
  return { paths: next, didChange: true, nextSegmentId };
};
