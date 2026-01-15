import { useCallback, useMemo } from 'react';
import { Platform } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, type SharedValue, useSharedValue } from 'react-native-reanimated';

import { snapToPixel, snapToPixelFloor } from './gestureMath';
import {
  type Cell,
  type DragPreviewSession,
  type OpenBounds,
  type PathsByColor,
  type PathsPayload,
} from './dragTypes';

export type GestureViewport = {
  width: number;
  height: number;
};

const isFiniteNumber = (value: number) => {
  'worklet';
  return Number.isFinite(value);
};

const clampNumber = (value: number, min: number, max: number) => {
  'worklet';
  return Math.min(max, Math.max(min, value));
};

const cellKeyWorklet = (x: number, y: number) => {
  'worklet';
  return `${x},${y}`;
};

const ANDROID_PINCH_FOCAL_JUMP = 24;
const ANDROID_MOVE_SLOP = 3;
const IOS_MOVE_SLOP = 2;
const MODE_IDLE = 0;
const MODE_DRAW = 1;
const MODE_PAN = 2;

type GestureControllerParams = {
  rows: number;
  cols: number;
  viewport: GestureViewport;
  fitCellSize: number;
  minCellSize: number;
  minScale: number;
  maxScale: number;
  pixelRatio: number;
  drawActivationDistance: number;
  panLongPressMs: number;
  pinchSnapDuring: boolean;
  isDrawing: SharedValue<number>;
  openBounds: OpenBounds;
  openSetByKey: SharedValue<Record<string, true>>;
  dotColorByKey: SharedValue<Record<string, string | undefined>>;
  areaByKey: SharedValue<Record<string, number | undefined>>;
  pathsShared: SharedValue<PathsByColor>;
  pathsMutated: SharedValue<number>;
  previewCells: SharedValue<number[]>;
  previewColor: SharedValue<string>;
  previewOpacity: SharedValue<number>;
  previewLineTipX: SharedValue<number>;
  previewLineTipY: SharedValue<number>;
  dragColor: SharedValue<string | null>;
  ensureTimerStarted: () => void;
  onDragEnd: () => void;
  onPathsMutated: (payload: PathsPayload) => void;
  onTap: (cellX: number, cellY: number) => void;
};

export const useGestureController = ({
  rows,
  cols,
  viewport,
  fitCellSize,
  minCellSize,
  minScale,
  maxScale,
  pixelRatio,
  drawActivationDistance,
  panLongPressMs,
  pinchSnapDuring,
  isDrawing,
  openBounds,
  openSetByKey,
  dotColorByKey,
  areaByKey,
  pathsShared,
  pathsMutated,
  previewCells,
  previewColor,
  previewOpacity,
  previewLineTipX,
  previewLineTipY,
  dragColor,
  ensureTimerStarted,
  onDragEnd,
  onPathsMutated,
  onTap,
}: GestureControllerParams) => {
  const isAndroid = Platform.OS === 'android';
  const moveSlop = isAndroid ? ANDROID_MOVE_SLOP : IOS_MOVE_SLOP;
  const panX = useSharedValue(0);
  const panY = useSharedValue(0);
  const savedPanX = useSharedValue(0);
  const savedPanY = useSharedValue(0);
  const zoomScale = useSharedValue(1);
  const pinchBaseScale = useSharedValue(1);
  const lastPinchScale = useSharedValue(1);
  const hasPinchUpdate = useSharedValue(0);
  const lastPinchFocalX = useSharedValue(0);
  const lastPinchFocalY = useSharedValue(0);
  const lastPinchPanX = useSharedValue(0);
  const lastPinchPanY = useSharedValue(0);
  const dragSession = useSharedValue<DragPreviewSession | null>(null);
  const drawStartX = useSharedValue(0);
  const drawStartY = useSharedValue(0);
  const gestureMode = useSharedValue(MODE_IDLE);
  const isPinching = useSharedValue(0);
  const isPanning = useSharedValue(0);
  const panStartTranslationX = useSharedValue(0);
  const panStartTranslationY = useSharedValue(0);
  const panHoldActive = useSharedValue(0);
  const anchorWorldX = useSharedValue(0);
  const anchorWorldY = useSharedValue(0);
  const pinchFocalX = useSharedValue(0);
  const pinchFocalY = useSharedValue(0);

  const logGesture = useCallback((label: string, data?: Record<string, unknown>) => {
    if (!__DEV__) return;
    if (data) {
      console.log(`[gesture] ${label}`, data);
      return;
    }
    console.log(`[gesture] ${label}`);
  }, []);

  const resetToFit = useCallback(() => {
    if (!viewport.width || !viewport.height) return;
    if (!isFiniteNumber(fitCellSize) || fitCellSize <= 0 || cols <= 0 || rows <= 0) return;
    zoomScale.value = 1;
    pinchBaseScale.value = 1;
    const width = cols * fitCellSize;
    const height = rows * fitCellSize;
    const offsetX = viewport.width / 2 - width / 2;
    const offsetY = viewport.height / 2 - height / 2;
    const snappedOffsetX =
      isFiniteNumber(pixelRatio) && pixelRatio > 0 ? snapToPixel(offsetX, pixelRatio) : offsetX;
    const snappedOffsetY =
      isFiniteNumber(pixelRatio) && pixelRatio > 0 ? snapToPixel(offsetY, pixelRatio) : offsetY;
    panX.value = snappedOffsetX;
    panY.value = snappedOffsetY;
    savedPanX.value = snappedOffsetX;
    savedPanY.value = snappedOffsetY;
  }, [
    cols,
    fitCellSize,
    panX,
    panY,
    pinchBaseScale,
    pixelRatio,
    rows,
    savedPanX,
    savedPanY,
    viewport.height,
    viewport.width,
    zoomScale,
  ]);

  const toLocal = (screenX: number, screenY: number) => {
    'worklet';
    const currentScale = zoomScale.value;
    const safeScale = isFiniteNumber(currentScale) && currentScale > 0 ? currentScale : 1;
    const localX = (screenX - panX.value) / safeScale;
    const localY = (screenY - panY.value) / safeScale;
    return { localX, localY };
  };

  const toCell = (screenX: number, screenY: number) => {
    'worklet';
    const { localX, localY } = toLocal(screenX, screenY);
    const size = fitCellSize > 0 ? fitCellSize : 1;
    return {
      cellX: Math.floor(localX / size),
      cellY: Math.floor(localY / size),
      localX,
      localY,
    };
  };

  const cellCenter = (cell: Cell, cellSize: number) => {
    'worklet';
    return { x: cell.x * cellSize + cellSize / 2, y: cell.y * cellSize + cellSize / 2 };
  };

  const flattenPath = (path: Cell[]) => {
    'worklet';
    const flat: number[] = new Array(path.length * 2);
    for (let index = 0; index < path.length; index += 1) {
      const cell = path[index];
      flat[index * 2] = cell.x;
      flat[index * 2 + 1] = cell.y;
    }
    return flat;
  };

  const findSegmentAt = (paths: PathsByColor, x: number, y: number) => {
    'worklet';
    for (const [color, segments] of Object.entries(paths)) {
      for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
        const segment = segments[segIndex];
        for (let cellIndex = 0; cellIndex < segment.cells.length; cellIndex += 1) {
          const cell = segment.cells[cellIndex];
          if (cell.x === x && cell.y === y) {
            return { color, segment, index: cellIndex };
          }
        }
      }
    }
    return null;
  };

  const clonePaths = (source: PathsByColor) => {
    'worklet';
    const next: PathsByColor = {};
    for (const color in source) {
      const segments = source[color];
      if (!segments || !segments.length) continue;
      const nextSegments = new Array(segments.length);
      for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
        const segment = segments[segIndex];
        const cells = new Array(segment.cells.length);
        for (let cellIndex = 0; cellIndex < segment.cells.length; cellIndex += 1) {
          const cell = segment.cells[cellIndex];
          cells[cellIndex] = { x: cell.x, y: cell.y };
        }
        nextSegments[segIndex] = { id: segment.id, cells };
      }
      next[color] = nextSegments;
    }
    return next;
  };

  const removeSegmentsWithEndpoint = (
    paths: PathsByColor,
    endpointKey: string,
    clone: boolean
  ) => {
    'worklet';
    const next = clone ? clonePaths(paths) : paths;
    let removed = false;
    for (const color in next) {
      const segments = next[color];
      if (!segments || !segments.length) continue;
      for (let segIndex = segments.length - 1; segIndex >= 0; segIndex -= 1) {
        const segment = segments[segIndex];
        if (!segment.cells.length) continue;
        const first = segment.cells[0];
        const last = segment.cells[segment.cells.length - 1];
        const firstKey = cellKeyWorklet(first.x, first.y);
        const lastKey = cellKeyWorklet(last.x, last.y);
        if (firstKey === endpointKey || lastKey === endpointKey) {
          segments.splice(segIndex, 1);
          removed = true;
        }
      }
      if (!segments.length) {
        delete next[color];
      }
    }
    return { next, removed };
  };

  const removeSegmentsWithColorInArea = (
    paths: PathsByColor,
    color: string,
    areaId: number,
    areaByKey: Record<string, number | undefined>,
    clone: boolean
  ) => {
    'worklet';
    const next = clone ? clonePaths(paths) : paths;
    let removed = false;
    const segments = next[color];
    if (!segments || !segments.length) return { next, removed };
    for (let segIndex = segments.length - 1; segIndex >= 0; segIndex -= 1) {
      const segment = segments[segIndex];
      if (!segment.cells.length) continue;
      const first = segment.cells[0];
      const last = segment.cells[segment.cells.length - 1];
      const firstKey = cellKeyWorklet(first.x, first.y);
      const lastKey = cellKeyWorklet(last.x, last.y);
      if (areaByKey[firstKey] === areaId || areaByKey[lastKey] === areaId) {
        segments.splice(segIndex, 1);
        removed = true;
      }
    }
    if (!segments.length) {
      delete next[color];
    }
    return { next, removed };
  };

  const serializePaths = (paths: PathsByColor): PathsPayload => {
    'worklet';
    const payload: PathsPayload = [];
    for (const colorKey in paths) {
      const segments = paths[colorKey] ?? [];
      const outSegments = [];
      for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
        const segment = segments[segIndex];
        const cells: number[] = [];
        for (let cellIndex = 0; cellIndex < segment.cells.length; cellIndex += 1) {
          const cell = segment.cells[cellIndex];
          cells.push(cell.x, cell.y);
        }
        outSegments.push({ id: segment.id, cells });
      }
      if (outSegments.length) {
        payload.push({ color: colorKey, segments: outSegments });
      }
    }
    return payload;
  };

  const buildPickupPath = (
    segment: { cells: Cell[] },
    index: number,
    color: string,
    dotColors: Record<string, string | undefined>
  ) => {
    'worklet';
    const cells = segment.cells;
    const leftLen = index + 1;
    const rightLen = cells.length - index;
    const leftEnd = cells[0];
    const rightEnd = cells[cells.length - 1];
    const leftDot = dotColors[cellKeyWorklet(leftEnd.x, leftEnd.y)] === color;
    const rightDot = dotColors[cellKeyWorklet(rightEnd.x, rightEnd.y)] === color;

    let useLeft = false;
    if (leftDot && !rightDot) {
      useLeft = true;
    } else if (rightDot && !leftDot) {
      useLeft = false;
    } else {
      useLeft = leftLen >= rightLen;
    }

    const slice = useLeft ? cells.slice(0, index + 1) : cells.slice(index).reverse();
    return slice.map((cell) => ({ x: cell.x, y: cell.y }));
  };

  const resolveAxis = (
    axis: 'x' | 'y' | null,
    deltaX: number,
    deltaY: number,
    last: Cell,
    pointerCell: Cell,
    pointerInOpen: boolean
  ) => {
    'worklet';
    const absX = Math.abs(deltaX);
    const absY = Math.abs(deltaY);
    const candidateCell = pointerInOpen ? pointerCell : last;

    if (!axis) {
      if (candidateCell.x === last.x && candidateCell.y === last.y) return null;
      if (candidateCell.x !== last.x && candidateCell.y !== last.y) {
        return absX >= absY ? 'x' : 'y';
      }
      return candidateCell.x !== last.x ? 'x' : 'y';
    }

    if (axis === 'x' && candidateCell.y !== last.y) {
      return candidateCell.x === last.x || absY >= absX ? 'y' : axis;
    }
    if (axis === 'y' && candidateCell.x !== last.x) {
      return candidateCell.y === last.y || absX >= absY ? 'x' : axis;
    }
    return axis;
  };

  const computeTip = (
    axis: 'x' | 'y' | null,
    localX: number,
    localY: number,
    last: Cell
  ) => {
    'worklet';
    const size = fitCellSize > 0 ? fitCellSize : 1;
    if (!axis) {
      return cellCenter(last, size);
    }
    const minX = openBounds.minX * size;
    const maxX = (openBounds.maxX + 1) * size;
    const minY = openBounds.minY * size;
    const maxY = (openBounds.maxY + 1) * size;
    const clampedX = clampNumber(localX, minX, maxX);
    const clampedY = clampNumber(localY, minY, maxY);
    const anchor = cellCenter(last, size);
    const axisTarget = axis === 'x' ? clampedX : clampedY;
    const axisAnchor = axis === 'x' ? anchor.x : anchor.y;
    const direction = Math.sign(axisTarget - axisAnchor);
    if (direction === 0) return anchor;

    const openSet = openSetByKey.value;
    const dotColors = dotColorByKey.value;
    const maxSteps =
      axis === 'x'
        ? direction > 0
          ? openBounds.maxX - last.x + 1
          : last.x - openBounds.minX + 1
        : direction > 0
          ? openBounds.maxY - last.y + 1
          : last.y - openBounds.minY + 1;
    let limitCoord = axisAnchor;
    for (let step = 1; step <= maxSteps; step += 1) {
      const nextX = last.x + (axis === 'x' ? direction * step : 0);
      const nextY = last.y + (axis === 'y' ? direction * step : 0);
      const key = cellKeyWorklet(nextX, nextY);
      if (!openSet[key]) {
        limitCoord = axisAnchor + direction * (step - 0.5) * size;
        break;
      }
      if (dotColors[key]) {
        limitCoord = axisAnchor + direction * step * size;
        break;
      }
    }
    if (limitCoord === axisAnchor) {
      limitCoord = axisAnchor + direction * (maxSteps - 0.5) * size;
    }
    const clampedAxis =
      direction > 0 ? Math.min(axisTarget, limitCoord) : Math.max(axisTarget, limitCoord);
    return axis === 'x' ? { x: clampedAxis, y: anchor.y } : { x: anchor.x, y: clampedAxis };
  };

  const startDragSession = (startCell: Cell): DragPreviewSession | null => {
    'worklet';
    const key = cellKeyWorklet(startCell.x, startCell.y);
    const openSet = openSetByKey.value;
    if (!openSet[key]) return null;
    const dotColors = dotColorByKey.value;
    const dotColor = dotColors[key];
    let paths = pathsShared.value;
    if (dotColor) {
      let nextPaths = paths;
      let removed = false;
      const endpointRemoval = removeSegmentsWithEndpoint(nextPaths, key, true);
      if (endpointRemoval.removed) {
        nextPaths = endpointRemoval.next;
        removed = true;
      }
      const areaId = areaByKey.value[key];
      if (areaId != null) {
        const areaRemoval = removeSegmentsWithColorInArea(
          nextPaths,
          dotColor,
          areaId,
          areaByKey.value,
          !removed
        );
        if (areaRemoval.removed) {
          nextPaths = areaRemoval.next;
          removed = true;
        }
      }
      if (removed) {
        pathsShared.value = nextPaths;
        paths = nextPaths;
        pathsMutated.value = 1;
        runOnJS(onPathsMutated)(serializePaths(paths));
      }
    }
    const segmentHit = findSegmentAt(paths, startCell.x, startCell.y);
    const color = dotColor ?? segmentHit?.color;
    if (!color) return null;
    let path: Cell[] = [{ ...startCell }];
    if (segmentHit && segmentHit.color === color) {
      path = buildPickupPath(segmentHit.segment, segmentHit.index, color, dotColors);
    }
    return {
      color,
      path,
      axis: null,
      locked: false,
      hasMoved: false,
    };
  };

  const updateDragSession = (
    session: DragPreviewSession,
    localX: number,
    localY: number
  ) => {
    'worklet';
    if (!session.path.length) {
      return { session, tip: { x: localX, y: localY }, pathChanged: false };
    }

    const size = fitCellSize > 0 ? fitCellSize : 1;
    const path = session.path;
    const last = path[path.length - 1];
    const anchor = cellCenter(last, size);
    const minX = openBounds.minX * size;
    const maxX = (openBounds.maxX + 1) * size;
    const minY = openBounds.minY * size;
    const maxY = (openBounds.maxY + 1) * size;
    const clampedX = clampNumber(localX, minX, maxX);
    const clampedY = clampNumber(localY, minY, maxY);
    const pointerCell = {
      x: clampNumber(Math.floor(clampedX / size), openBounds.minX, openBounds.maxX),
      y: clampNumber(Math.floor(clampedY / size), openBounds.minY, openBounds.maxY),
    };
    const pointerKey = cellKeyWorklet(pointerCell.x, pointerCell.y);
    const openSet = openSetByKey.value;
    const dotColors = dotColorByKey.value;
    const pointerInOpen = !!openSet[pointerKey];
    const deltaX = clampedX - anchor.x;
    const deltaY = clampedY - anchor.y;

    let axis = resolveAxis(session.axis, deltaX, deltaY, last, pointerCell, pointerInOpen);
    let locked = session.locked;
    let hasMoved = session.hasMoved;
    let pathChanged = false;

    if (axis) {
      const targetCoord = axis === 'x' ? pointerCell.x : pointerCell.y;
      let guard = 0;
      while (guard < 256) {
        guard += 1;
        const current = path[path.length - 1];
        const currentCoord = axis === 'x' ? current.x : current.y;
        const diff = targetCoord - currentCoord;
        if (diff === 0) break;
        const stepDir = Math.sign(diff);
        const next =
          axis === 'x'
            ? { x: current.x + stepDir, y: current.y }
            : { x: current.x, y: current.y + stepDir };

        const prev = path[path.length - 2];
        const isBacktrack = prev && prev.x === next.x && prev.y === next.y;
        if (isBacktrack) {
          path.pop();
          locked = false;
          pathChanged = true;
          continue;
        }
        if (locked) break;

        const nextKey = cellKeyWorklet(next.x, next.y);
        if (!openSet[nextKey]) break;

        const existingIndex = path.findIndex((cell) => cell.x === next.x && cell.y === next.y);
        if (existingIndex >= 0) {
          path.splice(existingIndex + 1);
          locked = false;
          pathChanged = true;
          break;
        }

        const dotColor = dotColors[nextKey];
        if (dotColor && dotColor !== session.color) break;

        path.push({ ...next });
        hasMoved = true;
        pathChanged = true;

        if (dotColor && dotColor === session.color) {
          locked = true;
          break;
        }
      }
    }

    const lastCell = path[path.length - 1];
    const lastDot = dotColors[cellKeyWorklet(lastCell.x, lastCell.y)];
    if (!lastDot || lastDot !== session.color || path.length === 1) {
      locked = false;
    }
    if (path.length <= 1) {
      axis = null;
    }

    const tipAxis = axis ?? (Math.abs(deltaX) >= Math.abs(deltaY) ? 'x' : 'y');
    const tip = locked ? cellCenter(lastCell, size) : computeTip(tipAxis, localX, localY, lastCell);

    session.path = path;
    session.axis = axis;
    session.locked = locked;
    session.hasMoved = hasMoved;

    return {
      session,
      tip,
      pathChanged,
    };
  };

  const clearPreview = () => {
    'worklet';
    previewCells.value = [];
    previewOpacity.value = 0;
    previewColor.value = 'transparent';
    dragSession.value = null;
    dragColor.value = null;
    previewLineTipX.value = 0;
    previewLineTipY.value = 0;
  };

  const pinch = useMemo(
    () =>
      Gesture.Pinch()
        .onStart((event) => {
          if (!isFiniteNumber(fitCellSize) || fitCellSize <= 0) {
            isPinching.value = 0;
            return;
          }
          runOnJS(ensureTimerStarted)();
          const currentScale = zoomScale.value;
          if (!isFiniteNumber(currentScale) || currentScale <= 0) {
            isPinching.value = 0;
            return;
          }
          isPinching.value = 1;
          pinchBaseScale.value = currentScale;
          lastPinchScale.value = 1;
          hasPinchUpdate.value = 0;
          lastPinchFocalX.value = event.focalX;
          lastPinchFocalY.value = event.focalY;
          lastPinchPanX.value = panX.value;
          lastPinchPanY.value = panY.value;
          anchorWorldX.value = (event.focalX - panX.value) / currentScale;
          anchorWorldY.value = (event.focalY - panY.value) / currentScale;
          pinchFocalX.value = event.focalX;
          pinchFocalY.value = event.focalY;
        })
        .onUpdate((event) => {
          if (isDrawing.value || !isPinching.value) return;
          const pointers = (event as { numberOfPointers?: number }).numberOfPointers;
          if (pointers != null && pointers < 2) return;
          const baseScale = pinchBaseScale.value;
          if (!isFiniteNumber(baseScale) || baseScale <= 0 || !isFiniteNumber(event.scale)) {
            return;
          }
          const rawScale = event.scale;
          if (hasPinchUpdate.value) {
            const ratio = lastPinchScale.value > 0 ? rawScale / lastPinchScale.value : 1;
            if (ratio < 0.7 || ratio > 1.3) {
              if (__DEV__ && isAndroid) {
                runOnJS(logGesture)('pinch scale jump', { rawScale, last: lastPinchScale.value });
              }
              return;
            }
          }
          const clampedScale = rawScale < 0.02 ? lastPinchScale.value : rawScale;
          lastPinchScale.value = clampedScale;
          hasPinchUpdate.value = 1;
          const minScaleByCell =
            minCellSize > 0 && fitCellSize > 0 ? minCellSize / fitCellSize : minScale;
          const minAllowedScale = Math.max(minScale, minScaleByCell);
          const nextScaleRaw = Math.max(
            minAllowedScale,
            Math.min(maxScale, baseScale * clampedScale)
          );
          const snapDuring = pinchSnapDuring && !isAndroid;
          if (!snapDuring) {
            const rawFocalX = event.focalX;
            const rawFocalY = event.focalY;
            const focalDx = rawFocalX - lastPinchFocalX.value;
            const focalDy = rawFocalY - lastPinchFocalY.value;
            const focalJump =
              isAndroid &&
              (Math.abs(focalDx) > ANDROID_PINCH_FOCAL_JUMP ||
                Math.abs(focalDy) > ANDROID_PINCH_FOCAL_JUMP);
            const focalX = focalJump ? lastPinchFocalX.value : rawFocalX;
            const focalY = focalJump ? lastPinchFocalY.value : rawFocalY;
            const nextPanX = focalX - anchorWorldX.value * nextScaleRaw;
            const nextPanY = focalY - anchorWorldY.value * nextScaleRaw;
            if (!isFiniteNumber(nextPanX) || !isFiniteNumber(nextPanY)) return;
            panX.value = nextPanX;
            panY.value = nextPanY;
            zoomScale.value = nextScaleRaw;
            pinchFocalX.value = focalX;
            pinchFocalY.value = focalY;
            lastPinchFocalX.value = focalX;
            lastPinchFocalY.value = focalY;
            lastPinchPanX.value = nextPanX;
            lastPinchPanY.value = nextPanY;
            return;
          }
          if (!isFiniteNumber(pixelRatio) || pixelRatio <= 0) return;
          const snappedCellSize = Math.max(
            minCellSize,
            snapToPixelFloor(fitCellSize * nextScaleRaw, pixelRatio)
          );
          if (!isFiniteNumber(snappedCellSize) || snappedCellSize <= 0 || fitCellSize <= 0) {
            return;
          }
          const nextScale = snappedCellSize / fitCellSize;
          if (!isFiniteNumber(nextScale) || nextScale <= 0) return;
          const nextPanX = event.focalX - anchorWorldX.value * nextScale;
          const nextPanY = event.focalY - anchorWorldY.value * nextScale;
          if (!isFiniteNumber(nextPanX) || !isFiniteNumber(nextPanY)) return;
          panX.value = snapToPixel(nextPanX, pixelRatio);
          panY.value = snapToPixel(nextPanY, pixelRatio);
          zoomScale.value = nextScale;
          pinchFocalX.value = event.focalX;
          pinchFocalY.value = event.focalY;
        })
        .onFinalize(() => {
          if (!isPinching.value) return;
          savedPanX.value = panX.value;
          savedPanY.value = panY.value;
          pinchBaseScale.value = zoomScale.value;
          isPinching.value = 0;
        }),
    [
      ensureTimerStarted,
      fitCellSize,
      isDrawing,
      isAndroid,
      isPinching,
      maxScale,
      minCellSize,
      minScale,
      panX,
      panY,
      pinchBaseScale,
      pinchFocalX,
      pinchFocalY,
      pinchSnapDuring,
      pixelRatio,
      savedPanX,
      savedPanY,
      zoomScale,
    ]
  );

  const panDraw = useMemo(() => {
    const moveSlopSq = moveSlop * moveSlop;

    return Gesture.Pan()
      .minPointers(1)
      .maxPointers(1)
      .minDistance(0)
      .onBegin((event) => {
        runOnJS(ensureTimerStarted)();
        drawStartX.value = event.x;
        drawStartY.value = event.y;
        gestureMode.value = MODE_IDLE;
        isDrawing.value = 0;
        isPanning.value = 0;
        panHoldActive.value = 0;
        dragSession.value = null;
      })
      .onUpdate((event) => {
        if (isPinching.value) return;
        const dx = event.x - drawStartX.value;
        const dy = event.y - drawStartY.value;
        const distSq = dx * dx + dy * dy;

        if (gestureMode.value === MODE_IDLE) {
          if (panHoldActive.value) {
            gestureMode.value = MODE_PAN;
            isPanning.value = 1;
            panStartTranslationX.value = event.translationX;
            panStartTranslationY.value = event.translationY;
          } else if (distSq >= moveSlopSq) {
            const { cellX, cellY } = toCell(drawStartX.value, drawStartY.value);
            if (cellX < 0 || cellY < 0 || cellX >= cols || cellY >= rows) {
              isDrawing.value = 0;
              clearPreview();
              return;
            }
            const session = startDragSession({ x: cellX, y: cellY });
            if (!session) {
              isDrawing.value = 0;
              clearPreview();
              return;
            }
            gestureMode.value = MODE_DRAW;
            isDrawing.value = 1;
            dragSession.value = session;
            dragColor.value = session.color;
            previewColor.value = session.color;
            previewOpacity.value = 1;
            previewCells.value = flattenPath(session.path);
            const startTip = cellCenter(session.path[session.path.length - 1], fitCellSize);
            previewLineTipX.value = startTip.x;
            previewLineTipY.value = startTip.y;
          }
        }

        if (gestureMode.value === MODE_DRAW && isDrawing.value) {
          const { localX, localY } = toCell(event.x, event.y);
          const session = dragSession.value;
          if (!session) return;
          const result = updateDragSession(session, localX, localY);
          dragSession.value = result.session;
          if (result.pathChanged) {
            previewCells.value = flattenPath(result.session.path);
          }
          previewLineTipX.value = result.tip.x;
          previewLineTipY.value = result.tip.y;
          return;
        }

        if (gestureMode.value === MODE_PAN && isPanning.value) {
          if (!isFiniteNumber(pixelRatio) || pixelRatio <= 0) return;
          const panDx = event.translationX - panStartTranslationX.value;
          const panDy = event.translationY - panStartTranslationY.value;
          panX.value = snapToPixel(savedPanX.value + panDx, pixelRatio);
          panY.value = snapToPixel(savedPanY.value + panDy, pixelRatio);
        }
      })
      .onEnd(() => {
        if (gestureMode.value === MODE_DRAW && isDrawing.value) {
          isDrawing.value = 0;
          runOnJS(onDragEnd)();
        }
        if (gestureMode.value === MODE_PAN && isPanning.value) {
          savedPanX.value = panX.value;
          savedPanY.value = panY.value;
        }
      })
      .onFinalize(() => {
        if (isDrawing.value) {
          isDrawing.value = 0;
          runOnJS(onDragEnd)();
        }
        isPanning.value = 0;
        gestureMode.value = MODE_IDLE;
      });
  }, [
    clearPreview,
    cols,
    dragColor,
    dragSession,
    drawStartX,
    drawStartY,
    ensureTimerStarted,
    fitCellSize,
    gestureMode,
    isDrawing,
    isPinching,
    isPanning,
    moveSlop,
    onDragEnd,
    openBounds,
    openSetByKey,
    dotColorByKey,
    pathsShared,
    panHoldActive,
    panStartTranslationX,
    panStartTranslationY,
    panX,
    panY,
    pixelRatio,
    previewCells,
    previewColor,
    previewLineTipX,
    previewLineTipY,
    previewOpacity,
    rows,
    savedPanX,
    savedPanY,
    startDragSession,
    toCell,
    updateDragSession,
  ]);

  const panHold = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(panLongPressMs)
        .maxDistance(moveSlop)
        .onStart(() => {
          panHoldActive.value = 1;
        })
        .onFinalize(() => {
          panHoldActive.value = 0;
        }),
    [moveSlop, panHoldActive, panLongPressMs]
  );

  const tap = useMemo(() => {
    const maxDuration = Math.max(120, panLongPressMs - 10);
    const maxDistance = Math.max(drawActivationDistance, 16);
    return Gesture.Tap()
      .maxDistance(maxDistance)
      .maxDuration(maxDuration)
      .requireExternalGestureToFail(panDraw)
      .onBegin((event) => {
        runOnJS(logGesture)('tap begin', { x: event.x, y: event.y });
      })
      .onEnd((event, success) => {
        runOnJS(logGesture)('tap end', { success, x: event.x, y: event.y });
        if (!success) return;
        runOnJS(ensureTimerStarted)();
        const { cellX, cellY } = toCell(event.x, event.y);
        if (cellX < 0 || cellY < 0 || cellX >= cols || cellY >= rows) return;
        runOnJS(onTap)(cellX, cellY);
      })
      .onFinalize((event, success) => {
        runOnJS(logGesture)('tap finalize', {
          success,
          x: event.x,
          y: event.y,
          duration: 'duration' in event ? event.duration : undefined,
        });
      });
  }, [
    cols,
    drawActivationDistance,
    ensureTimerStarted,
    logGesture,
    onTap,
    panDraw,
    panLongPressMs,
    rows,
    toCell,
  ]);

  const gesture = useMemo(
    () => Gesture.Simultaneous(pinch, panDraw, tap, panHold),
    [panDraw, pinch, tap, panHold]
  );

  return {
    gesture,
    panX,
    panY,
    zoomScale,
    resetToFit,
  };
};
