import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Canvas, Group, Line, Path, Rect, Skia, type SkPath } from '@shopify/react-native-skia';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PixelRatio,
  Platform,
  Pressable as RNPressable,
  type PressableProps,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  makeShareableCloneRecursive,
  runOnJS,
  runOnUI,
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import levelsData from '@/data/levels.json';
import { commitDragWorklet } from '@/game/dragCommitWorklet';
import { useGestureController } from '@/game/gestureController';
import { snapToPixel, snapToPixelFloor } from '@/game/gestureMath';
import {
  cellKey,
  type Cell,
  type DotPoint,
  type PathsByColor,
  type PathsPayload,
} from '@/game/dragTypes';
import { theme } from '@/constants/theme';
import {
  clampLevelId,
  getCurrentLevelId,
  resetCurrentLevelId,
  setCurrentLevelId,
} from '@/state/sessionProgress';

type OpenCell = {
  x: number;
  y: number;
};

type GridCell = {
  x: number;
  y: number;
  dot?: string;
  segment?: string;
  area?: number;
  id?: string;
  dir?: 'up' | 'down' | 'left' | 'right';
};

type DotEndpoint = {
  x: number;
  y: number;
};

type DotPair = {
  color: string;
  a: DotEndpoint;
  b: DotEndpoint;
};

type ModalState = 'complete' | 'timeout' | 'failed';
type GestureTuning = {
  drawActivationDistance: number;
  panLongPressMs: number;
  pinchSnapDuring: boolean;
};

type ConfettiTemplate = {
  id: string;
  x: number;
  y: number;
  size: number;
  color: string;
  delay: number;
  drift: number;
  rotation: number;
};

const Pressable = ({ onPress, ...props }: PressableProps) => {
  const safeOnPress = typeof onPress === 'function' ? onPress : undefined;
  if (__DEV__ && onPress != null && typeof onPress !== 'function') {
    console.warn('[Pressable] Invalid onPress value', onPress);
  }
  return <RNPressable {...props} onPress={safeOnPress} />;
};

type Level = {
  id: number;
  rows: number;
  cols: number;
  grid?: GridCell[];
  openCells?: OpenCell[];
  dots?: DotPair[];
  timerSeconds?: number;
};

const BASE_CELL_SIZE = 28;
const GRID_MARGIN = BASE_CELL_SIZE;
const MIN_SCALE = 0.1;
const MAX_SCALE = 20;
const DRAW_ACTIVATION_DISTANCE = 6;
const PIXEL_RATIO = PixelRatio.get();
const MIN_CELL_SIZE = 1 / PIXEL_RATIO;
const IOS_PAN_LONG_PRESS_MS = 1000;
const ANDROID_DRAW_ACTIVATION_DISTANCE = 8;
const CANVAS_POINTER_EVENTS = Platform.OS === 'android' ? 'none' : 'auto';
const getDefaultGestureTuning = (): GestureTuning => ({
  drawActivationDistance:
    Platform.OS === 'android' ? ANDROID_DRAW_ACTIVATION_DISTANCE : DRAW_ACTIVATION_DISTANCE,
  panLongPressMs: IOS_PAN_LONG_PRESS_MS,
  pinchSnapDuring: true,
});
const AREA_PALETTE = [
  'red',
  'light_blue',
  'yellow',
  'green',
  'purple',
  'orange',
  'pink',
  'silver',
  'gold',
  'dark_blue',
  'black',
  'brown',
  'crimson',
  'white',
];

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};
const withAlpha = (color: string, alpha: number) => {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
const clampNumber = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));
const confettiTemplate: ConfettiTemplate[] = [
  { id: 'c1', x: 0.15, y: 0.05, size: 10, color: '#F2C94C', delay: 0, drift: -0.08, rotation: -120 },
  { id: 'c2', x: 0.3, y: 0.08, size: 12, color: '#5BC0FF', delay: 0.05, drift: 0.05, rotation: 90 },
  { id: 'c3', x: 0.48, y: 0.03, size: 9, color: '#2ECC71', delay: 0.1, drift: -0.04, rotation: -80 },
  { id: 'c4', x: 0.62, y: 0.07, size: 11, color: '#F45B69', delay: 0.08, drift: 0.07, rotation: 110 },
  { id: 'c5', x: 0.78, y: 0.04, size: 10, color: '#F2994A', delay: 0.12, drift: -0.06, rotation: -100 },
  { id: 'c6', x: 0.22, y: 0.12, size: 8, color: '#F27AD7', delay: 0.15, drift: 0.04, rotation: 70 },
  { id: 'c7', x: 0.4, y: 0.1, size: 10, color: '#97B4FF', delay: 0.18, drift: -0.05, rotation: -95 },
  { id: 'c8', x: 0.58, y: 0.12, size: 9, color: '#F8F9FF', delay: 0.2, drift: 0.06, rotation: 85 },
  { id: 'c9', x: 0.72, y: 0.1, size: 11, color: '#F2C94C', delay: 0.22, drift: -0.04, rotation: -120 },
  { id: 'c10', x: 0.86, y: 0.08, size: 8, color: '#5BC0FF', delay: 0.25, drift: 0.05, rotation: 90 },
];

export default function GameScreen() {
  const { levelId, debug, showDebugDot } = useLocalSearchParams<{
    levelId?: string;
    debug?: string;
    showDebugDot?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isAndroid = Platform.OS === 'android';

  const maxLevelId = useMemo(() => {
    if (!levelsData.levels.length) return 1;
    return levelsData.levels.reduce(
      (max, item) => (item.id > max ? item.id : max),
      levelsData.levels[0].id
    );
  }, []);

  const resolvedLevelId = useMemo(() => {
    const parsedId = Number(levelId);
    if (Number.isFinite(parsedId) && parsedId > 0) {
      return parsedId;
    }
    return getCurrentLevelId();
  }, [levelId]);

  const level = useMemo(() => {
    const clampedId = clampLevelId(resolvedLevelId, maxLevelId);
    const target = levelsData.levels.find((item) => item.id === clampedId);
    return (target ?? levelsData.levels[0]) as Level;
  }, [maxLevelId, resolvedLevelId]);

  useEffect(() => {
    const clampedId = clampLevelId(level.id, maxLevelId);
    setCurrentLevelId(clampedId);
  }, [level.id, maxLevelId]);
  const gridCells = level.grid;
  const openCells = useMemo(() => {
    if (gridCells?.length) {
      return gridCells.map((cell) => ({ x: cell.x, y: cell.y }));
    }
    return level.openCells ?? [];
  }, [gridCells, level.openCells]);
  const dotPoints = useMemo(() => {
    const points: DotPoint[] = [];

    if (level.dots?.length) {
      for (const pair of level.dots) {
        points.push({ color: pair.color, ...pair.a });
        points.push({ color: pair.color, ...pair.b });
      }
    }

    if (gridCells?.length) {
      for (const cell of gridCells) {
        if (!cell.dot) continue;
        points.push({
          x: cell.x,
          y: cell.y,
          color: dotColorMap[cell.dot] ?? theme.colors.textLight,
        });
      }
    }

    return points;
  }, [level.dots, gridCells]);

  const openSet = useMemo(() => {
    return new Set(openCells.map((cell) => cellKey(cell.x, cell.y)));
  }, [openCells]);

  useEffect(() => {
    const next: Record<string, true> = {};
    openSet.forEach((key) => {
      next[key] = true;
    });
    openSetShared.value = makeShareableCloneRecursive(next);
  }, [openSet, openSetShared]);

  const openBounds = useMemo(() => {
    if (!openCells.length) {
      return {
        minX: 0,
        minY: 0,
        maxX: Math.max(0, level.cols - 1),
        maxY: Math.max(0, level.rows - 1),
      };
    }
    let minX = Number.POSITIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    openCells.forEach((cell) => {
      minX = Math.min(minX, cell.x);
      minY = Math.min(minY, cell.y);
      maxX = Math.max(maxX, cell.x);
      maxY = Math.max(maxY, cell.y);
    });
    return { minX, minY, maxX, maxY };
  }, [openCells, level.cols, level.rows]);

  const dotMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const dot of dotPoints) {
      map.set(cellKey(dot.x, dot.y), dot.color);
    }
    return map;
  }, [dotPoints]);
  const areaByKey = useMemo(() => {
    const map: Record<string, number> = {};
    if (!gridCells?.length) return map;
    gridCells.forEach((cell) => {
      if (cell.area == null) return;
      map[cellKey(cell.x, cell.y)] = cell.area;
    });
    return map;
  }, [gridCells]);
  const pathColors = useMemo(() => {
    const colors = new Set<string>();
    dotPoints.forEach((dot) => {
      colors.add(dot.color);
    });
    return Array.from(colors);
  }, [dotPoints]);

  const [paths, setPaths] = useState<PathsByColor>({});
  const pathsRef = useRef<PathsByColor>({});
  const [history, setHistory] = useState<PathsByColor[]>([]);
  const [isWin, setIsWin] = useState(false);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [confettiOn, setConfettiOn] = useState(false);
  const [showDebugOverlay, setShowDebugOverlay] = useState(false);
  const [showDebugMenu, setShowDebugMenu] = useState(false);
  const [interactionMode, setInteractionMode] = useState<'draw' | 'pan'>('draw');
  const [gestureTuning, setGestureTuning] = useState<GestureTuning>(() => ({
    ...getDefaultGestureTuning(),
  }));
  const cellSizeShared = useSharedValue(BASE_CELL_SIZE);
  const dragColor = useSharedValue<string | null>(null);
  const pendingCommitSnapshotRef = useRef<PathsByColor | null>(null);
  const previewCells = useSharedValue<number[]>([]);
  const previewColor = useSharedValue('transparent');
  const previewOpacity = useSharedValue(0);
  const previewLineTipX = useSharedValue(0);
  const previewLineTipY = useSharedValue(0);
  const pathsMutated = useSharedValue(0);
  const previewKeys = useDerivedValue(() => {
    const keys: Record<string, true> = {};
    const cells = previewCells.value;
    for (let index = 0; index < cells.length; index += 2) {
      keys[`${cells[index]},${cells[index + 1]}`] = true;
    }
    return keys;
  });
  const previewBasePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const cells = previewCells.value;
    const size = cellSizeShared.value;
    if (!cells.length || !size) return path;
    const count = Math.floor(cells.length / 2);
    const baseCount = count > 1 ? count - 1 : 0;
    if (!baseCount) return path;
    path.moveTo(cells[0] * size + size / 2, cells[1] * size + size / 2);
    for (let index = 1; index < baseCount; index += 1) {
      const x = cells[index * 2] * size + size / 2;
      const y = cells[index * 2 + 1] * size + size / 2;
      path.lineTo(x, y);
    }
    return path;
  });
  const previewLineStartX = useDerivedValue(() => {
    const cells = previewCells.value;
    const size = cellSizeShared.value;
    if (!cells.length || !size) return 0;
    const count = Math.floor(cells.length / 2);
    const anchorIndex = count > 1 ? count - 2 : 0;
    return cells[anchorIndex * 2] * size + size / 2;
  });
  const previewLineStartY = useDerivedValue(() => {
    const cells = previewCells.value;
    const size = cellSizeShared.value;
    if (!cells.length || !size) return 0;
    const count = Math.floor(cells.length / 2);
    const anchorIndex = count > 1 ? count - 2 : 0;
    return cells[anchorIndex * 2 + 1] * size + size / 2;
  });
  const openSetShared = useSharedValue<Record<string, true>>({});
  const pathsShared = useSharedValue<PathsByColor>({});
  const dotColorShared = useSharedValue<Record<string, string>>({});
  const areaByKeyShared = useSharedValue<Record<string, number | undefined>>({});
  const segmentIdSeed = useSharedValue(Date.now());
  const segmentIdCounter = useSharedValue(0);
  const timerDeadlineRef = useRef<number | null>(null);
  const pendingTimerSecondsRef = useRef<number | null>(level.timerSeconds ?? null);
  const hasTimerStartedRef = useRef(false);
  const confettiTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isModalOpen = modal !== null;
  const debugDotTop = insets.top + theme.sizes.topBarHeight + 6;
  const shouldShowDebugDot = showDebugDot === '1';
  const timerTone =
    timeLeft != null && timeLeft <= 10
      ? 'danger'
      : timeLeft != null && timeLeft <= 20
        ? 'warning'
        : 'normal';

  const debugStats = useMemo(() => {
    const filled = new Set<string>();
    const usedDotEndpoints = new Set<string>();
    const passThroughDots = new Set<string>();
    let endpointsOffDots = 0;
    let segments = 0;

    for (const [color, segs] of Object.entries(paths)) {
      for (const segment of segs) {
        if (!segment.cells.length) continue;
        segments += 1;
        const first = segment.cells[0];
        const last = segment.cells[segment.cells.length - 1];
        const firstKey = cellKey(first.x, first.y);
        const lastKey = cellKey(last.x, last.y);
        if (dotMap.has(firstKey)) {
          usedDotEndpoints.add(firstKey);
        } else {
          endpointsOffDots += 1;
        }
        if (dotMap.has(lastKey)) {
          usedDotEndpoints.add(lastKey);
        } else {
          endpointsOffDots += 1;
        }
        segment.cells.forEach((cell, index) => {
          const key = cellKey(cell.x, cell.y);
          filled.add(key);
          if (dotMap.has(key) && index !== 0 && index !== segment.cells.length - 1) {
            passThroughDots.add(key);
          }
        });
      }
    }

    const allDotKeys = Array.from(dotMap.keys());
    const unusedDots = allDotKeys.filter((key) => !usedDotEndpoints.has(key));

    return {
      filledCount: filled.size,
      totalOpen: openSet.size,
      usedDots: usedDotEndpoints.size,
      totalDots: dotMap.size,
      passThroughDots: Array.from(passThroughDots),
      endpointsOffDots,
      unusedDots,
      segments,
    };
  }, [dotMap, openSet.size, paths]);

  const isDrawing = useSharedValue(0);
  const modalAnim = useSharedValue(0);
  const winGlow = useSharedValue(0);
  const confettiProgress = useSharedValue(0);

  useEffect(() => {
    pathsRef.current = paths;
    pathsShared.value = makeShareableCloneRecursive(paths);
  }, [paths, pathsShared]);
  useEffect(() => {
    const next: Record<string, string> = {};
    dotMap.forEach((color, key) => {
      next[key] = color;
    });
    dotColorShared.value = makeShareableCloneRecursive(next);
  }, [dotColorShared, dotMap]);
  useEffect(() => {
    areaByKeyShared.value = makeShareableCloneRecursive(areaByKey);
  }, [areaByKey, areaByKeyShared]);

  useEffect(() => {
    return () => {
      if (confettiTimeoutRef.current) {
        clearTimeout(confettiTimeoutRef.current);
      }
    };
  }, []);

  const armTimer = useCallback((seconds: number | null) => {
    pendingTimerSecondsRef.current = seconds;
    timerDeadlineRef.current = null;
    hasTimerStartedRef.current = false;
    setTimeLeft(seconds);
  }, []);

  const startTimer = useCallback((seconds: number | null) => {
    pendingTimerSecondsRef.current = seconds;
    if (seconds == null) {
      timerDeadlineRef.current = null;
      setTimeLeft(null);
      hasTimerStartedRef.current = true;
      return;
    }
    hasTimerStartedRef.current = true;
    timerDeadlineRef.current = Date.now() + seconds * 1000;
    setTimeLeft(seconds);
  }, []);

  const ensureTimerStarted = useCallback(() => {
    if (!timerEnabled) return;
    if (hasTimerStartedRef.current) return;
    startTimer(pendingTimerSecondsRef.current);
  }, [startTimer, timerEnabled]);

  const pauseTimer = useCallback(() => {
    if (!timerDeadlineRef.current) return;
    const remainingMs = Math.max(0, timerDeadlineRef.current - Date.now());
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    setTimeLeft(remainingSeconds);
    timerDeadlineRef.current = null;
  }, []);

  const clearPreviewLayer = useCallback(() => {
    previewCells.value = [];
    previewOpacity.value = 0;
    previewColor.value = 'transparent';
    previewLineTipX.value = 0;
    previewLineTipY.value = 0;
    dragColor.value = null;
    isDrawing.value = 0;
    pathsMutated.value = 0;
  }, [
    dragColor,
    isDrawing,
    pathsMutated,
    previewCells,
    previewColor,
    previewLineTipX,
    previewLineTipY,
    previewOpacity,
  ]);

  const handleToggleMode = useCallback(() => {
    setInteractionMode((prev) => (prev === 'draw' ? 'pan' : 'draw'));
    clearPreviewLayer();
  }, [clearPreviewLayer]);

  useEffect(() => {
    setPaths({});
    setHistory([]);
    setIsWin(false);
    setModal(null);
    clearPreviewLayer();
    armTimer(timerEnabled ? (level.timerSeconds ?? null) : null);
  }, [armTimer, clearPreviewLayer, level.id, level.timerSeconds, timerEnabled]);

  useEffect(() => {
    if (!timerEnabled || isWin || isModalOpen) return;
    const tick = () => {
      if (!timerDeadlineRef.current) return;
      const remainingMs = Math.max(0, timerDeadlineRef.current - Date.now());
      const remainingSeconds = Math.ceil(remainingMs / 1000);
      setTimeLeft(remainingSeconds);
      if (remainingMs <= 0) {
        timerDeadlineRef.current = null;
        setTimeLeft(0);
        clearPreviewLayer();
        setModal('timeout');
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [clearPreviewLayer, isWin, isModalOpen, level.id, timerEnabled]);

  useEffect(() => {
    if (!isWin) return;
    pauseTimer();
    clearPreviewLayer();
    winGlow.value = 0;
    winGlow.value = withSequence(
      withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }),
      withTiming(0, { duration: 700, easing: Easing.out(Easing.cubic) })
    );
    setConfettiOn(true);
    confettiProgress.value = 0;
    confettiProgress.value = withTiming(1, { duration: 1200, easing: Easing.out(Easing.cubic) });
    if (confettiTimeoutRef.current) {
      clearTimeout(confettiTimeoutRef.current);
    }
    confettiTimeoutRef.current = setTimeout(() => {
      setConfettiOn(false);
      confettiTimeoutRef.current = null;
    }, 1400);
    setModal((prev) => prev ?? 'complete');
  }, [clearPreviewLayer, confettiProgress, isWin, pauseTimer, winGlow]);

  const triggerWin = useCallback(() => {
    setIsWin(true);
    setModal('complete');
  }, []);

  const triggerFail = useCallback(() => {
    setIsWin(false);
    timerDeadlineRef.current = null;
    setTimeLeft(0);
    setModal('timeout');
  }, []);

  useEffect(() => {
    if (!debug) return;
    if (debug === 'win') {
      triggerWin();
    }
    if (debug === 'fail') {
      triggerFail();
    }
  }, [debug, level.id, triggerFail, triggerWin]);

  useEffect(() => {
    if (!modal) return;
    modalAnim.value = 0;
    modalAnim.value = withTiming(1, { duration: 240, easing: Easing.out(Easing.cubic) });
  }, [modal, modalAnim]);

  const modalOverlayStyle = useAnimatedStyle(() => ({
    opacity: modalAnim.value,
  }));

  const modalCardStyle = useAnimatedStyle(() => ({
    opacity: modalAnim.value,
    transform: [{ scale: interpolate(modalAnim.value, [0, 1], [0.92, 1]) }],
  }));

  const winGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(winGlow.value, [0, 1], [0, 0.18]),
  }));

  const clonePaths = useCallback((source: PathsByColor) => {
    const next: PathsByColor = {};
    for (const color of Object.keys(source)) {
      next[color] = source[color].map((segment) => ({
        id: segment.id,
        cells: segment.cells.map((cell) => ({ x: cell.x, y: cell.y })),
      }));
    }
    return next;
  }, []);

  const checkWin = useCallback(
    (nextPaths: PathsByColor) => {
      if (isModalOpen) return false;
      if (!openSet.size || dotMap.size === 0) return false;
      const filled = new Set<string>();
      const usedDots = new Set<string>();
      let valid = true;

      for (const [color, segments] of Object.entries(nextPaths)) {
        for (const segment of segments) {
          if (segment.cells.length < 2) return false;
          const first = segment.cells[0];
          const last = segment.cells[segment.cells.length - 1];
          const firstKey = cellKey(first.x, first.y);
          const lastKey = cellKey(last.x, last.y);
          if (dotMap.get(firstKey) !== color || dotMap.get(lastKey) !== color) return false;
          if (firstKey === lastKey) return false;
          if (usedDots.has(firstKey) || usedDots.has(lastKey)) return false;
          usedDots.add(firstKey);
          usedDots.add(lastKey);

          for (let index = 0; index < segment.cells.length; index += 1) {
            const cell = segment.cells[index];
            const key = cellKey(cell.x, cell.y);
            if (filled.has(key)) {
              valid = false;
              break;
            }
            filled.add(key);
            const dotColor = dotMap.get(key);
            if (dotColor && index !== 0 && index !== segment.cells.length - 1) {
              valid = false;
              break;
            }
          }
          if (!valid) break;
        }
        if (!valid) break;
      }

      if (!valid) return false;
      if (usedDots.size !== dotMap.size) return false;
      return filled.size === openSet.size;
    },
    [dotMap, isModalOpen, openSet]
  );

  const applyPaths = useCallback(
    (next: PathsByColor) => {
      pathsRef.current = next;
      setPaths(next);
      pathsShared.value = makeShareableCloneRecursive(next);
      setIsWin(checkWin(next));
    },
    [checkWin, pathsShared]
  );

  const finalizeCommit = useCallback(
    (nextPaths: PathsByColor | null, didChange: boolean) => {
      if (!didChange) {
        clearPreviewLayer();
        pendingCommitSnapshotRef.current = null;
        return;
      }
      if (!nextPaths) {
        pendingCommitSnapshotRef.current = null;
        return;
      }
      const snapshot = pendingCommitSnapshotRef.current;
      pendingCommitSnapshotRef.current = null;
      if (snapshot) {
        setHistory((prev) => [...prev, snapshot]);
      }
      applyPaths(nextPaths);
      clearPreviewLayer();
    },
    [applyPaths, clearPreviewLayer]
  );

  const deserializePaths = useCallback((payload: PathsPayload): PathsByColor => {
    const next: PathsByColor = {};
    payload.forEach((entry) => {
      const segments = entry.segments.map((segment) => {
        const cells: Array<{ x: number; y: number }> = [];
        for (let index = 0; index < segment.cells.length; index += 2) {
          cells.push({ x: segment.cells[index], y: segment.cells[index + 1] });
        }
        return { id: segment.id, cells };
      });
      if (segments.length) {
        next[entry.color] = segments;
      }
    });
    return next;
  }, []);

  const finalizeCommitFromPayload = useCallback(
    (payload: PathsPayload, didChange: boolean) => {
      if (!didChange) {
        finalizeCommit(null, false);
        return;
      }
      const nextPaths = deserializePaths(payload);
      finalizeCommit(nextPaths, true);
    },
    [deserializePaths, finalizeCommit]
  );

  const handleDebugToggleTimer = useCallback(() => {
    setTimerEnabled((prev) => {
      const next = !prev;
      armTimer(next ? (level.timerSeconds ?? null) : null);
      return next;
    });
  }, [armTimer, level.timerSeconds]);

  const resetLevel = useCallback(() => {
    applyPaths({});
    setHistory([]);
    setIsWin(false);
    setModal(null);
    setConfettiOn(false);
    confettiProgress.value = 0;
    if (confettiTimeoutRef.current) {
      clearTimeout(confettiTimeoutRef.current);
      confettiTimeoutRef.current = null;
    }
    clearPreviewLayer();
    armTimer(timerEnabled ? (level.timerSeconds ?? null) : null);
  }, [applyPaths, armTimer, clearPreviewLayer, confettiProgress, level.timerSeconds, timerEnabled]);

  const advanceLevel = useCallback(() => {
    const nextId = clampLevelId(level.id + 1, maxLevelId);
    setCurrentLevelId(nextId);
  }, [level.id, maxLevelId]);

  const handleCompleteContinue = useCallback(() => {
    advanceLevel();
    setModal(null);
    router.replace('/');
  }, [advanceLevel, router]);

  const handleTimeoutContinue = useCallback(() => {
    setModal(null);
    startTimer(30);
  }, [startTimer]);

  const handleTimeoutClose = useCallback(() => {
    setModal('failed');
  }, []);

  const handleFailedTryAgain = useCallback(() => {
    resetLevel();
  }, [resetLevel]);

  const handleFailedClose = useCallback(() => {
    setModal(null);
    router.replace('/');
  }, [router]);

  const resetProgress = useCallback(() => {
    resetCurrentLevelId();
    setCurrentLevelId(clampLevelId(1, maxLevelId));
    resetLevel();
  }, [maxLevelId, resetLevel]);

  const applyAndroidGesturePreset = useCallback(() => {
    setGestureTuning({
      drawActivationDistance: ANDROID_DRAW_ACTIVATION_DISTANCE,
      panLongPressMs: IOS_PAN_LONG_PRESS_MS,
      pinchSnapDuring: true,
    });
  }, []);

  const applyIosGesturePreset = useCallback(() => {
    setGestureTuning({
      drawActivationDistance: DRAW_ACTIVATION_DISTANCE,
      panLongPressMs: IOS_PAN_LONG_PRESS_MS,
      pinchSnapDuring: true,
    });
  }, []);

  const applyPlatformGesturePreset = useCallback(() => {
    setGestureTuning(getDefaultGestureTuning());
  }, []);

  const adjustDrawActivationDistance = useCallback((delta: number) => {
    setGestureTuning((prev) => ({
      ...prev,
      drawActivationDistance: clampNumber(prev.drawActivationDistance + delta, 2, 40),
    }));
  }, []);

  const adjustPanLongPressMs = useCallback((delta: number) => {
    setGestureTuning((prev) => ({
      ...prev,
      panLongPressMs: clampNumber(prev.panLongPressMs + delta, 80, 600),
    }));
  }, []);

  const togglePinchSnapDuring = useCallback(() => {
    setGestureTuning((prev) => ({
      ...prev,
      pinchSnapDuring: !prev.pinchSnapDuring,
    }));
  }, []);

  const openDebugMenu = useCallback(() => {
    setShowDebugMenu(true);
  }, []);
  const closeDebugMenu = useCallback(() => {
    setShowDebugMenu(false);
  }, []);
  const handleDebugResetGame = useCallback(() => {
    resetProgress();
    closeDebugMenu();
  }, [closeDebugMenu, resetProgress]);
  const handleDebugAndroidPreset = useCallback(() => {
    applyAndroidGesturePreset();
    closeDebugMenu();
  }, [applyAndroidGesturePreset, closeDebugMenu]);
  const handleDebugIosPreset = useCallback(() => {
    applyIosGesturePreset();
    closeDebugMenu();
  }, [applyIosGesturePreset, closeDebugMenu]);
  const handleDebugResetGesture = useCallback(() => {
    applyPlatformGesturePreset();
    closeDebugMenu();
  }, [applyPlatformGesturePreset, closeDebugMenu]);
  const handleDebugToggleOverlay = useCallback(() => {
    setShowDebugOverlay((prev) => !prev);
    closeDebugMenu();
  }, [closeDebugMenu]);
  const handleDebugWin = useCallback(() => {
    triggerWin();
    closeDebugMenu();
  }, [closeDebugMenu, triggerWin]);
  const handleDebugFail = useCallback(() => {
    triggerFail();
    closeDebugMenu();
  }, [closeDebugMenu, triggerFail]);

  const stopDrawing = useCallback(() => {
    const hadSnapshot = pendingCommitSnapshotRef.current !== null;
    if (!hadSnapshot) {
      pendingCommitSnapshotRef.current = clonePaths(pathsRef.current);
    }
    runOnUI(() => {
      'worklet';
      const buildPayload = (paths: PathsByColor): PathsPayload => {
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
      const mutated = pathsMutated.value === 1;
      const color = dragColor.value;
      const flat = previewCells.value;
      if (!color || flat.length < 4) {
        if (mutated) {
          runOnJS(finalizeCommitFromPayload)(buildPayload(pathsShared.value), true);
        } else {
          runOnJS(finalizeCommitFromPayload)([], false);
        }
        return;
      }
      const path: Cell[] = new Array(flat.length / 2);
      for (let index = 0; index < flat.length; index += 2) {
        path[index / 2] = { x: flat[index], y: flat[index + 1] };
      }
      const session = {
        color,
        axis: null,
        locked: false,
        hasMoved: path.length > 1,
        path,
      };
      const result = commitDragWorklet(
        pathsShared.value,
        session,
        dotColorShared.value,
        areaByKeyShared.value,
        segmentIdSeed.value,
        segmentIdCounter.value
      );
      if (result.didChange) {
        segmentIdCounter.value = result.nextSegmentId;
        pathsShared.value = result.paths;
        runOnJS(finalizeCommitFromPayload)(buildPayload(result.paths), true);
      } else {
        if (mutated) {
          runOnJS(finalizeCommitFromPayload)(buildPayload(pathsShared.value), true);
        } else {
          runOnJS(finalizeCommitFromPayload)([], false);
        }
      }
    })();
  }, [
    clonePaths,
    dragColor,
    finalizeCommitFromPayload,
    pathsShared,
    pathsMutated,
    dotColorShared,
    areaByKeyShared,
    previewCells,
    segmentIdCounter,
    segmentIdSeed,
  ]);

  const handleTap = useCallback(
    (cellX: number, cellY: number) => {
      if (isModalOpen) return;
      const key = cellKey(cellX, cellY);
      const color = dotMap.get(key);
      if (!color) return;
      if (!pendingCommitSnapshotRef.current) {
        pendingCommitSnapshotRef.current = clonePaths(pathsRef.current);
      }
      runOnUI((tapX, tapY, tapColor) => {
        'worklet';
        const session = {
          color: tapColor,
          axis: null,
          locked: false,
          hasMoved: false,
          path: [{ x: tapX, y: tapY }],
        };
        const result = commitDragWorklet(
          pathsShared.value,
          session,
          dotColorShared.value,
          areaByKeyShared.value,
          segmentIdSeed.value,
          segmentIdCounter.value
        );
        if (result.didChange) {
          segmentIdCounter.value = result.nextSegmentId;
          pathsShared.value = result.paths;
          const payload: PathsPayload = [];
          for (const colorKey in result.paths) {
            const segments = result.paths[colorKey] ?? [];
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
          runOnJS(finalizeCommitFromPayload)(payload, true);
        } else {
          runOnJS(finalizeCommitFromPayload)([], false);
        }
      })(cellX, cellY, color);
    },
    [
      clonePaths,
      dotMap,
      finalizeCommitFromPayload,
      isModalOpen,
      pathsShared,
      dotColorShared,
      areaByKeyShared,
      segmentIdCounter,
      segmentIdSeed,
    ]
  );

  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const lastInitKey = useRef<string | null>(null);

  const fitCellSize = useMemo(() => {
    if (!viewport.width || !viewport.height) return BASE_CELL_SIZE;
    const availableWidth = Math.max(0, viewport.width - GRID_MARGIN * 2);
    const availableHeight = Math.max(0, viewport.height - GRID_MARGIN * 2);
    const fit = Math.min(availableWidth / level.cols, availableHeight / level.rows);
    return Math.max(MIN_CELL_SIZE, snapToPixelFloor(fit, PIXEL_RATIO));
  }, [level.cols, level.rows, viewport.height, viewport.width]);

  useEffect(() => {
    cellSizeShared.value = fitCellSize;
  }, [cellSizeShared, fitCellSize]);

  const { gesture, panX, panY, zoomScale, resetToFit } = useGestureController({
    rows: level.rows,
    cols: level.cols,
    viewport,
    fitCellSize,
    minCellSize: MIN_CELL_SIZE,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
    pixelRatio: PIXEL_RATIO,
    drawActivationDistance: gestureTuning.drawActivationDistance,
    panLongPressMs: gestureTuning.panLongPressMs,
    pinchSnapDuring: gestureTuning.pinchSnapDuring,
    interactionMode,
    isDrawing,
    openBounds,
    openSetByKey: openSetShared,
    dotColorByKey: dotColorShared,
    areaByKey: areaByKeyShared,
    pathsShared,
    pathsMutated,
    previewCells,
    previewColor,
    previewOpacity,
    previewLineTipX,
    previewLineTipY,
    dragColor,
    ensureTimerStarted,
    onDragEnd: stopDrawing,
    onTap: handleTap,
  });

  const gridTransform = useDerivedValue(() => [
    { translateX: panX.value },
    { translateY: panY.value },
    { scale: zoomScale.value },
  ]);

  const pathStroke = Math.max(MIN_CELL_SIZE, snapToPixel(fitCellSize * 0.38, PIXEL_RATIO));
  const pathRadius = pathStroke / 2;

  const confettiPieces = useMemo<ConfettiPiece[]>(() => {
    if (!viewport.width || !viewport.height) return [];
    return confettiTemplate.map((piece) => ({
      ...piece,
      x: piece.x * viewport.width,
      y: piece.y * viewport.height,
      drift: piece.drift * viewport.width,
    }));
  }, [viewport.width, viewport.height]);

  useEffect(() => {
    if (!viewport.width || !viewport.height) return;
    const initKey = `${level.id}-${viewport.width}-${viewport.height}`;
    if (lastInitKey.current === initKey) return;
    resetToFit();
    lastInitKey.current = initKey;
  }, [level.id, resetToFit, viewport.height, viewport.width]);

  return (
    <LinearGradient
      colors={['#0C1742', '#1D2C6A', '#23357A']}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.container}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top, height: insets.top + theme.sizes.topBarHeight },
        ]}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="chevron-left" size={30} color={theme.colors.textLight} />
        </Pressable>
        <View style={styles.headerActions}>
          {timerEnabled && timeLeft != null ? (
            <View
              style={[
                styles.timerPill,
                timerTone === 'warning' && styles.timerPillWarn,
                timerTone === 'danger' && styles.timerPillDanger,
              ]}>
              <Text style={styles.timerText}>{formatTime(timeLeft)}</Text>
            </View>
          ) : null}
        </View>
        <View
          pointerEvents="none"
          style={[styles.headerTitle, { top: insets.top, height: theme.sizes.topBarHeight }]}>
          <Text style={styles.headerText}>Level {level.id}</Text>
        </View>
      </View>
      {shouldShowDebugDot ? (
        <Pressable
          onPress={openDebugMenu}
          hitSlop={12}
          style={[styles.debugDot, { top: debugDotTop }]}
        />
      ) : null}
      {shouldShowDebugDot && showDebugOverlay ? (
        <View style={[styles.debugPanel, { top: debugDotTop + 14 }]} pointerEvents="auto">
          <Text style={styles.debugTitle}>Debug</Text>
          <Text style={styles.debugText}>
            Filled: {debugStats.filledCount}/{debugStats.totalOpen}
          </Text>
          <Text style={styles.debugText}>
            Dots used: {debugStats.usedDots}/{debugStats.totalDots}
          </Text>
          <Text style={styles.debugText}>Segments: {debugStats.segments}</Text>
          {debugStats.passThroughDots.length ? (
            <Text style={styles.debugText}>
              Dot pass-through: {debugStats.passThroughDots.length}
            </Text>
          ) : null}
          {debugStats.endpointsOffDots ? (
            <Text style={styles.debugText}>
              Endpoints off dots: {debugStats.endpointsOffDots}
            </Text>
          ) : null}
          {debugStats.unusedDots.length ? (
            <Text style={styles.debugText}>
              Unused dots: {debugStats.unusedDots.slice(0, 4).join(' ')}
              {debugStats.unusedDots.length > 4 ? '…' : ''}
            </Text>
          ) : null}
          <View style={styles.debugSection}>
            <Text style={styles.debugSectionTitle}>Gesture</Text>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Draw dist</Text>
              <View style={styles.debugControls}>
                <Pressable
                  onPress={() => adjustDrawActivationDistance(-1)}
                  style={styles.debugButton}>
                  <Text style={styles.debugButtonText}>-</Text>
                </Pressable>
                <Text style={styles.debugValue}>{gestureTuning.drawActivationDistance}</Text>
                <Pressable
                  onPress={() => adjustDrawActivationDistance(1)}
                  style={styles.debugButton}>
                  <Text style={styles.debugButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
            <View style={styles.debugRow}>
              <Text style={styles.debugLabel}>Pan hold</Text>
              <View style={styles.debugControls}>
                <Pressable onPress={() => adjustPanLongPressMs(-20)} style={styles.debugButton}>
                  <Text style={styles.debugButtonText}>-</Text>
                </Pressable>
                <Text style={styles.debugValue}>{gestureTuning.panLongPressMs}ms</Text>
                <Pressable onPress={() => adjustPanLongPressMs(20)} style={styles.debugButton}>
                  <Text style={styles.debugButtonText}>+</Text>
                </Pressable>
              </View>
            </View>
            <Pressable onPress={togglePinchSnapDuring} style={styles.debugToggle}>
              <Text style={styles.debugToggleText}>
                Pinch snap: {gestureTuning.pinchSnapDuring ? 'On' : 'Off'}
              </Text>
            </Pressable>
            <Text style={styles.debugText}>Platform: {Platform.OS}</Text>
          </View>
        </View>
      ) : null}
      {showDebugMenu ? (
        <View style={styles.debugMenuOverlay}>
          <View style={styles.debugMenuCard}>
            <Text style={styles.debugMenuTitle}>Debug</Text>
            <Pressable
              onPress={handleDebugResetGame}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>Reset Game</Text>
            </Pressable>
            <Pressable
              onPress={handleDebugToggleTimer}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>
                Timer: {timerEnabled ? 'On' : 'Off'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDebugAndroidPreset}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>Gesture Preset: Android</Text>
            </Pressable>
            <Pressable
              onPress={handleDebugIosPreset}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>Gesture Preset: iOS</Text>
            </Pressable>
            <Pressable
              onPress={handleDebugResetGesture}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>Reset Gesture Tuning</Text>
            </Pressable>
            <Pressable
              onPress={handleDebugToggleOverlay}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>
                {showDebugOverlay ? 'Hide Debug Overlay' : 'Show Debug Overlay'}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleDebugWin}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>Level Win</Text>
            </Pressable>
            <Pressable
              onPress={handleDebugFail}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>Level Fail</Text>
            </Pressable>
            <Pressable
              onPress={closeDebugMenu}
              style={({ pressed }) => [styles.debugMenuButton, pressed && styles.debugMenuButtonPressed]}>
              <Text style={styles.debugMenuButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <View
        style={styles.gridViewport}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setViewport({ width, height });
        }}>
        <GestureDetector gesture={gesture}>
          <View style={styles.gestureLayer} collapsable={!isAndroid}>
            <MemoGridCanvas
              rows={level.rows}
              cols={level.cols}
              cellSize={fitCellSize}
              canvasWidth={viewport.width}
              canvasHeight={viewport.height}
              transform={gridTransform}
              gridCells={gridCells}
              lineColor="#5B7DFF"
              backgroundColor="transparent"
              openCells={openCells}
              dotPoints={dotPoints}
            />
            <CommittedPathsCanvas
              width={viewport.width}
              height={viewport.height}
              colors={pathColors}
              pathsShared={pathsShared}
              dotColorByKey={dotColorShared}
              previewKeys={previewKeys}
              cellSize={cellSizeShared}
              strokeWidth={pathStroke}
              nodeRadius={pathRadius}
              transform={gridTransform}
            />
            <DragPreviewCanvas
              width={viewport.width}
              height={viewport.height}
              previewBasePath={previewBasePath}
              previewColor={previewColor}
              previewOpacity={previewOpacity}
              previewLineStartX={previewLineStartX}
              previewLineStartY={previewLineStartY}
              previewLineTipX={previewLineTipX}
              previewLineTipY={previewLineTipY}
              strokeWidth={pathStroke}
              transform={gridTransform}
            />
          </View>
        </GestureDetector>
        <Animated.View pointerEvents="none" style={[styles.winGlow, winGlowStyle]} />
        {confettiOn ? (
          <View pointerEvents="none" style={styles.confettiLayer}>
            {confettiPieces.map((piece) => (
              <ConfettiPieceView key={piece.id} piece={piece} progress={confettiProgress} />
            ))}
          </View>
        ) : null}
      </View>
      <View style={[styles.toolbar, { paddingBottom: insets.bottom + 18 }]}>
        <View style={styles.toolbarRow}>
          <Pressable
            onPress={handleToggleMode}
            style={({ pressed }) => [
              styles.toolbarButton,
              interactionMode === 'draw' ? styles.toolbarButtonActive : styles.toolbarButtonActivePan,
              pressed && styles.toolbarButtonPressed,
            ]}>
            <MaterialCommunityIcons
              name={interactionMode === 'draw' ? 'pencil' : 'arrow-all'}
              size={22}
              color={theme.colors.textLight}
            />
          </Pressable>
        </View>
      </View>
      {modal ? (
        <Animated.View style={[styles.modalOverlay, modalOverlayStyle]}>
          <Animated.View style={modalCardStyle}>
            <LinearGradient
              colors={['#23357A', '#1A2A63']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalCard}>
            {modal !== 'complete' ? (
              <Pressable
                onPress={modal === 'timeout' ? handleTimeoutClose : handleFailedClose}
                style={styles.modalClose}>
                <MaterialCommunityIcons name="close" size={18} color={theme.colors.textLight} />
              </Pressable>
            ) : null}
            <Text style={styles.modalTitle}>
              {modal === 'timeout' ? 'Time Out!' : `Level ${level.id}`}
            </Text>
            {modal === 'complete' || modal === 'failed' ? (
              <Text style={styles.modalSubtitle}>
                {modal === 'complete' ? 'Level Complete' : 'Failed!'}
              </Text>
            ) : null}
            {modal === 'timeout' ? (
              <Text style={styles.modalBody}>Get 30 seconds to keep playing!</Text>
            ) : null}
            <Pressable
              onPress={
                modal === 'complete'
                  ? handleCompleteContinue
                  : modal === 'timeout'
                    ? handleTimeoutContinue
                    : handleFailedTryAgain
              }
              style={({ pressed }) => [
                styles.modalButton,
                pressed && styles.modalButtonPressed,
              ]}>
              <Text style={styles.modalButtonText}>
                {modal === 'complete' ? 'Continue' : modal === 'timeout' ? 'Continue' : 'Try Again'}
              </Text>
            </Pressable>
            </LinearGradient>
          </Animated.View>
        </Animated.View>
      ) : null}
    </LinearGradient>
  );
}

type ConfettiPiece = ConfettiTemplate & {
  x: number;
  y: number;
  drift: number;
};

function ConfettiPieceView({
  piece,
  progress,
}: {
  piece: ConfettiPiece;
  progress: SharedValue<number>;
}) {
  const animatedStyle = useAnimatedStyle(() => {
    const tRaw = (progress.value - piece.delay) / (1 - piece.delay);
    const t = Math.min(Math.max(tRaw, 0), 1);
    const translateY = t * 220;
    const translateX = t * piece.drift;
    const rotate = `${piece.rotation * t}deg`;
    const opacity = t < 0.15 ? t / 0.15 : 1 - t * 0.7;
    return {
      opacity,
      transform: [{ translateX }, { translateY }, { rotate }],
    };
  }, [piece.delay, piece.drift, piece.rotation, progress]);

  return (
    <Animated.View
      style={[
        styles.confettiPiece,
        {
          left: piece.x,
          top: piece.y,
          width: piece.size,
          height: piece.size,
          backgroundColor: piece.color,
        },
        animatedStyle,
      ]}
    />
  );
}

function GridCanvas({
  rows,
  cols,
  cellSize,
  canvasWidth,
  canvasHeight,
  transform,
  gridCells,
  lineColor,
  backgroundColor,
  openCells,
  dotPoints,
}: {
  rows: number;
  cols: number;
  cellSize: number;
  canvasWidth: number;
  canvasHeight: number;
  transform: SharedValue<Array<{ scale?: number; translateX?: number; translateY?: number }>>;
  gridCells?: GridCell[];
  lineColor: string;
  backgroundColor: string;
  openCells?: OpenCell[];
  dotPoints?: DotPoint[];
}) {
  const width = cols * cellSize;
  const height = rows * cellSize;
  const dotRadius = cellSize * 0.28;
  const gridStroke = 1 / PIXEL_RATIO;
  const areaStroke = 3 / PIXEL_RATIO;

  const cellRects = useMemo(() => {
    if (!openCells?.length) return null;
    return openCells.filter((cell) => {
      return cell.x >= 0 && cell.x < cols && cell.y >= 0 && cell.y < rows;
    });
  }, [openCells, cols, rows]);

  const visibleDots = useMemo(() => {
    if (!dotPoints?.length) return null;
    return dotPoints.filter((point) => {
      return point.x >= 0 && point.x < cols && point.y >= 0 && point.y < rows;
    });
  }, [dotPoints, cols, rows]);

  const cellStrokePath = useMemo(() => {
    if (!cellRects?.length) return null;
    const path = Skia.Path.Make();
    for (let index = 0; index < cellRects.length; index += 1) {
      const cell = cellRects[index];
      path.addRect(Skia.XYWHRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize));
    }
    return path;
  }, [cellRects, cellSize]);

  const gridLinesPath = useMemo(() => {
    if (cellRects) return null;
    const path = Skia.Path.Make();
    for (let index = 0; index <= cols; index += 1) {
      const x = index * cellSize;
      path.moveTo(x, 0);
      path.lineTo(x, height);
    }
    for (let index = 0; index <= rows; index += 1) {
      const y = index * cellSize;
      path.moveTo(0, y);
      path.lineTo(width, y);
    }
    return path;
  }, [cellRects, cols, cellSize, height, rows, width]);


  const areaLookup = useMemo(() => {
    const map = new Map<string, string>();
    if (!gridCells?.length) return map;
    gridCells.forEach((cell) => {
      if (cell.area == null) return;
      const colorName = AREA_PALETTE[(cell.area - 1) % AREA_PALETTE.length] ?? 'light_blue';
      map.set(cellKey(cell.x, cell.y), colorName);
    });
    return map;
  }, [gridCells]);

  const areaIdLookup = useMemo(() => {
    const map = new Map<string, number>();
    if (!gridCells?.length) return map;
    gridCells.forEach((cell) => {
      if (cell.area == null) return;
      map.set(cellKey(cell.x, cell.y), cell.area);
    });
    return map;
  }, [gridCells]);

  const areaCells = useMemo(() => {
    if (!gridCells?.length || areaLookup.size === 0) return [];
    return gridCells
      .filter((cell) => cell.area != null)
      .map((cell) => {
        const colorName = areaLookup.get(cellKey(cell.x, cell.y));
        if (!colorName) return null;
        return {
          x: cell.x,
          y: cell.y,
          color: dotColorMap[colorName] ?? lineColor,
        };
      })
      .filter((cell): cell is { x: number; y: number; color: string } => cell !== null);
  }, [areaLookup, gridCells, lineColor]);

  const areaCellPaths = useMemo(() => {
    if (!areaCells.length) return [];
    const map = new Map<string, SkPath>();
    for (let index = 0; index < areaCells.length; index += 1) {
      const cell = areaCells[index];
      const key = cell.color;
      const path = map.get(key) ?? Skia.Path.Make();
      path.addRect(Skia.XYWHRect(cell.x * cellSize, cell.y * cellSize, cellSize, cellSize));
      map.set(key, path);
    }
    return Array.from(map.entries()).map(([color, path]) => ({ color, path }));
  }, [areaCells, cellSize]);

  const areaBorders = useMemo(() => {
    if (!gridCells?.length || areaIdLookup.size === 0) return [];
    const edges: Array<{ x1: number; y1: number; x2: number; y2: number; color: string }> = [];
    const resolveAreaColor = (areaId: number) => {
      const colorName = AREA_PALETTE[(areaId - 1) % AREA_PALETTE.length] ?? 'light_blue';
      return dotColorMap[colorName] ?? lineColor;
    };
    const inset = areaStroke / 2;

    gridCells.forEach((cell) => {
      if (cell.area == null) return;
      const currentId = cell.area;
      const currentColor = resolveAreaColor(currentId);
      const x0 = cell.x * cellSize;
      const x1 = (cell.x + 1) * cellSize;
      const y0 = cell.y * cellSize;
      const y1 = (cell.y + 1) * cellSize;

      const leftId = areaIdLookup.get(cellKey(cell.x - 1, cell.y));
      if (leftId !== currentId) {
        const x = x0 + inset;
        edges.push({ x1: x, y1: y0 + inset, x2: x, y2: y1 - inset, color: currentColor });
      }

      const rightId = areaIdLookup.get(cellKey(cell.x + 1, cell.y));
      if (rightId !== currentId) {
        const x = x1 - inset;
        edges.push({ x1: x, y1: y0 + inset, x2: x, y2: y1 - inset, color: currentColor });
      }

      const upId = areaIdLookup.get(cellKey(cell.x, cell.y - 1));
      if (upId !== currentId) {
        const y = y0 + inset;
        edges.push({ x1: x0 + inset, y1: y, x2: x1 - inset, y2: y, color: currentColor });
      }

      const downId = areaIdLookup.get(cellKey(cell.x, cell.y + 1));
      if (downId !== currentId) {
        const y = y1 - inset;
        edges.push({ x1: x0 + inset, y1: y, x2: x1 - inset, y2: y, color: currentColor });
      }
    });
    return edges;
  }, [areaIdLookup, areaStroke, cellSize, gridCells, lineColor]);

  const areaBorderPaths = useMemo(() => {
    if (!areaBorders.length) return [];
    const map = new Map<string, SkPath>();
    const half = areaStroke / 2;
    for (let index = 0; index < areaBorders.length; index += 1) {
      const edge = areaBorders[index];
      const key = edge.color;
      const path = map.get(key) ?? Skia.Path.Make();
      if (Math.abs(edge.x1 - edge.x2) < 0.001) {
        const x = edge.x1 - half;
        const y = Math.min(edge.y1, edge.y2) - half;
        const height = Math.abs(edge.y2 - edge.y1) + areaStroke;
        path.addRect(Skia.XYWHRect(x, y, areaStroke, height));
      } else {
        const x = Math.min(edge.x1, edge.x2) - half;
        const y = edge.y1 - half;
        const width = Math.abs(edge.x2 - edge.x1) + areaStroke;
        path.addRect(Skia.XYWHRect(x, y, width, areaStroke));
      }
      map.set(key, path);
    }
    return Array.from(map.entries()).map(([color, path]) => ({ color, path }));
  }, [areaBorders, areaStroke]);

  const dotPaths = useMemo(() => {
    if (!visibleDots?.length) return [];
    const map = new Map<string, SkPath>();
    for (let index = 0; index < visibleDots.length; index += 1) {
      const dot = visibleDots[index];
      const key = dot.color;
      const path = map.get(key) ?? Skia.Path.Make();
      path.addCircle(dot.x * cellSize + cellSize / 2, dot.y * cellSize + cellSize / 2, dotRadius);
      map.set(key, path);
    }
    return Array.from(map.entries()).map(([color, path]) => ({ color, path }));
  }, [dotRadius, visibleDots, cellSize]);

  return (
    <Canvas pointerEvents={CANVAS_POINTER_EVENTS} style={{ width: canvasWidth, height: canvasHeight }}>
      <Group transform={transform}>
        <Rect x={0} y={0} width={width} height={height} color={backgroundColor} />
        {cellStrokePath ? (
          <Path path={cellStrokePath} color={lineColor} style="stroke" strokeWidth={gridStroke} />
        ) : null}
        {gridLinesPath ? (
          <Path path={gridLinesPath} color={lineColor} style="stroke" strokeWidth={gridStroke} />
        ) : null}
        {areaCellPaths.map((entry) => (
          <Path
            key={`area-stroke-${entry.color}`}
            path={entry.path}
            color={withAlpha(entry.color, 0.5)}
            style="stroke"
            strokeWidth={gridStroke}
          />
        ))}
        {areaBorderPaths.map((entry) => (
          <Path
            key={`area-border-${entry.color}`}
            path={entry.path}
            color={withAlpha(entry.color, 0.85)}
            style="fill"
          />
        ))}
        {dotPaths.map((entry) => (
          <Path key={`dot-${entry.color}`} path={entry.path} color={entry.color} style="fill" />
        ))}
      </Group>
    </Canvas>
  );
}

const MemoGridCanvas = memo(GridCanvas);

function CommittedPathsCanvas({
  width,
  height,
  colors,
  pathsShared,
  dotColorByKey,
  previewKeys,
  cellSize,
  strokeWidth,
  nodeRadius,
  transform,
}: {
  width: number;
  height: number;
  colors: string[];
  pathsShared: SharedValue<PathsByColor>;
  dotColorByKey: SharedValue<Record<string, string>>;
  previewKeys: SharedValue<Record<string, true>>;
  cellSize: SharedValue<number>;
  strokeWidth: number;
  nodeRadius: number;
  transform: SharedValue<Array<{ scale?: number; translateX?: number; translateY?: number }>>;
}) {
  return (
    <Canvas
      pointerEvents={CANVAS_POINTER_EVENTS}
      style={[{ width, height }, styles.dragPreviewCanvas]}>
      <Group transform={transform}>
        {colors.map((color) => (
          <CommittedPathLayer
            key={`committed-${color}`}
            color={color}
            pathsShared={pathsShared}
            dotColorByKey={dotColorByKey}
            previewKeys={previewKeys}
            cellSize={cellSize}
            strokeWidth={strokeWidth}
            nodeRadius={nodeRadius}
          />
        ))}
      </Group>
    </Canvas>
  );
}

function CommittedPathLayer({
  color,
  pathsShared,
  dotColorByKey,
  previewKeys,
  cellSize,
  strokeWidth,
  nodeRadius,
}: {
  color: string;
  pathsShared: SharedValue<PathsByColor>;
  dotColorByKey: SharedValue<Record<string, string>>;
  previewKeys: SharedValue<Record<string, true>>;
  cellSize: SharedValue<number>;
  strokeWidth: number;
  nodeRadius: number;
}) {
  const fillColor = withAlpha(color, 0.22);
  const glowCompleteColor = withAlpha(color, 0.18);
  const glowIncompleteColor = withAlpha(color, 0.12);
  const segmentIntersectsPreview = (segment: { cells: Cell[] }, preview: Record<string, true>) => {
    'worklet';
    for (let cellIndex = 0; cellIndex < segment.cells.length; cellIndex += 1) {
      const cell = segment.cells[cellIndex];
      if (preview[`${cell.x},${cell.y}`]) {
        return true;
      }
    }
    return false;
  };

  const fillPath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const size = cellSize.value;
    const segments = pathsShared.value[color];
    if (!size || !segments || !segments.length) return path;
    const dotColors = dotColorByKey.value;
    for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
      const segment = segments[segIndex];
      if (segment.cells.length < 2) continue;
      const first = segment.cells[0];
      const last = segment.cells[segment.cells.length - 1];
      const firstKey = `${first.x},${first.y}`;
      const lastKey = `${last.x},${last.y}`;
      if (dotColors[firstKey] !== color || dotColors[lastKey] !== color) continue;
      for (let cellIndex = 0; cellIndex < segment.cells.length; cellIndex += 1) {
        const cell = segment.cells[cellIndex];
        path.addRect(Skia.XYWHRect(cell.x * size, cell.y * size, size, size));
      }
    }
    return path;
  });

  const glowCompletePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const size = cellSize.value;
    const segments = pathsShared.value[color];
    if (!size || !segments || !segments.length) return path;
    const dotColors = dotColorByKey.value;
    for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
      const segment = segments[segIndex];
      if (segment.cells.length < 2) continue;
      const first = segment.cells[0];
      const last = segment.cells[segment.cells.length - 1];
      const firstKey = `${first.x},${first.y}`;
      const lastKey = `${last.x},${last.y}`;
      if (dotColors[firstKey] !== color || dotColors[lastKey] !== color) continue;
      for (let cellIndex = 0; cellIndex < segment.cells.length; cellIndex += 1) {
        const cell = segment.cells[cellIndex];
        path.addRect(Skia.XYWHRect(cell.x * size, cell.y * size, size, size));
      }
    }
    return path;
  });

  const glowIncompletePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const size = cellSize.value;
    const segments = pathsShared.value[color];
    if (!size || !segments || !segments.length) return path;
    const dotColors = dotColorByKey.value;
    for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
      const segment = segments[segIndex];
      if (segment.cells.length < 2) continue;
      const first = segment.cells[0];
      const last = segment.cells[segment.cells.length - 1];
      const firstKey = `${first.x},${first.y}`;
      const lastKey = `${last.x},${last.y}`;
      if (dotColors[firstKey] === color && dotColors[lastKey] === color) continue;
      for (let cellIndex = 0; cellIndex < segment.cells.length; cellIndex += 1) {
        const cell = segment.cells[cellIndex];
        path.addRect(Skia.XYWHRect(cell.x * size, cell.y * size, size, size));
      }
    }
    return path;
  });

  const strokePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const size = cellSize.value;
    const segments = pathsShared.value[color];
    if (!size || !segments || !segments.length) return path;
    const preview = previewKeys.value;
    let hasPreview = false;
    for (const key in preview) {
      hasPreview = true;
      break;
    }
    for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
      const segment = segments[segIndex];
      if (hasPreview && segmentIntersectsPreview(segment, preview)) {
        continue;
      }
      const cells = segment.cells;
      if (!cells.length) continue;
      path.moveTo(cells[0].x * size + size / 2, cells[0].y * size + size / 2);
      for (let cellIndex = 1; cellIndex < cells.length; cellIndex += 1) {
        const cell = cells[cellIndex];
        path.lineTo(cell.x * size + size / 2, cell.y * size + size / 2);
      }
    }
    return path;
  });

  const nodePath = useDerivedValue(() => {
    const path = Skia.Path.Make();
    const size = cellSize.value;
    const segments = pathsShared.value[color];
    if (!size || !segments || !segments.length) return path;
    const preview = previewKeys.value;
    let hasPreview = false;
    for (const key in preview) {
      hasPreview = true;
      break;
    }
    for (let segIndex = 0; segIndex < segments.length; segIndex += 1) {
      const segment = segments[segIndex];
      if (hasPreview && segmentIntersectsPreview(segment, preview)) {
        continue;
      }
      const cells = segment.cells;
      for (let cellIndex = 0; cellIndex < cells.length; cellIndex += 1) {
        const cell = cells[cellIndex];
        path.addCircle(cell.x * size + size / 2, cell.y * size + size / 2, nodeRadius);
      }
    }
    return path;
  });

  return (
    <Fragment>
      <Path path={fillPath} color={fillColor} style="fill" />
      <Path path={glowCompletePath} color={glowCompleteColor} style="fill" />
      <Path path={glowIncompletePath} color={glowIncompleteColor} style="fill" />
      <Path
        path={strokePath}
        color={color}
        style="stroke"
        strokeWidth={strokeWidth}
        strokeCap="round"
        strokeJoin="round"
      />
      <Path path={nodePath} color={color} style="fill" />
    </Fragment>
  );
}

function DragPreviewCanvas({
  width,
  height,
  previewBasePath,
  previewColor,
  previewOpacity,
  previewLineStartX,
  previewLineStartY,
  previewLineTipX,
  previewLineTipY,
  strokeWidth,
  transform,
}: {
  width: number;
  height: number;
  previewBasePath: SharedValue<SkPath>;
  previewColor: SharedValue<string>;
  previewOpacity: SharedValue<number>;
  previewLineStartX: SharedValue<number>;
  previewLineStartY: SharedValue<number>;
  previewLineTipX: SharedValue<number>;
  previewLineTipY: SharedValue<number>;
  strokeWidth: number;
  transform: SharedValue<Array<{ scale?: number; translateX?: number; translateY?: number }>>;
}) {
  const lineStart = useDerivedValue(() => ({
    x: previewLineStartX.value,
    y: previewLineStartY.value,
  }));
  const lineEnd = useDerivedValue(() => ({
    x: previewLineTipX.value,
    y: previewLineTipY.value,
  }));
  return (
    <Canvas
      pointerEvents={CANVAS_POINTER_EVENTS}
      style={[{ width, height }, styles.dragPreviewCanvas]}>
      <Group transform={transform}>
        <Path
          path={previewBasePath}
          color={previewColor}
          opacity={previewOpacity}
          style="stroke"
          strokeWidth={strokeWidth}
          strokeCap="round"
          strokeJoin="round"
          start={0}
          end={1}
        />
        <Line
          p1={lineStart}
          p2={lineEnd}
          color={previewColor}
          opacity={previewOpacity}
          strokeWidth={strokeWidth}
          strokeCap="round"
        />
      </Group>
    </Canvas>
  );
}

const dotColorMap: Record<string, string> = {
  red: '#F45B69',
  dark_blue: '#1C3F95',
  yellow: '#F2C94C',
  green: '#2ECC71',
  purple: '#7B5CFF',
  orange: '#F2994A',
  black: '#0B0B0B',
  white: '#F8F9FF',
  light_blue: '#5BC0FF',
  pink: '#F27AD7',
  brown: '#8D6E63',
  crimson: '#D7263D',
  gold: '#F0B63A',
  silver: '#C0C6D0',
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    justifyContent: 'space-between',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 15,
  },
  headerText: {
    fontFamily: theme.fonts.title,
    fontSize: 24,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 10,
  },
  debugDot: {
    position: 'absolute',
    right: 18,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    zIndex: 12,
    elevation: 12,
  },
  debugPanel: {
    position: 'absolute',
    right: 18,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(8, 12, 28, 0.8)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    zIndex: 12,
    elevation: 12,
    maxWidth: 240,
  },
  debugTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 12,
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  debugText: {
    fontFamily: theme.fonts.body,
    fontSize: 11,
    color: theme.colors.textLight,
  },
  debugSection: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    paddingTop: 6,
  },
  debugSectionTitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 11,
    color: theme.colors.textLight,
    marginBottom: 4,
  },
  debugRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  debugLabel: {
    fontFamily: theme.fonts.body,
    fontSize: 10,
    color: theme.colors.textLight,
  },
  debugControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  debugButton: {
    width: 20,
    height: 20,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  debugButtonText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 12,
    color: theme.colors.textLight,
  },
  debugValue: {
    minWidth: 44,
    textAlign: 'center',
    fontFamily: theme.fonts.body,
    fontSize: 10,
    color: theme.colors.textLight,
  },
  debugToggle: {
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  debugToggleText: {
    fontFamily: theme.fonts.body,
    fontSize: 10,
    color: theme.colors.textLight,
  },
  debugMenuOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 12, 28, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 30,
    elevation: 30,
  },
  debugMenuCard: {
    width: '100%',
    maxWidth: 320,
    borderRadius: 16,
    backgroundColor: '#F3F5FF',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  debugMenuTitle: {
    fontFamily: theme.fonts.title,
    fontSize: 18,
    color: '#0F1D3A',
    marginBottom: 12,
  },
  debugMenuButton: {
    paddingVertical: 10,
  },
  debugMenuButtonPressed: {
    opacity: 0.6,
  },
  debugMenuButtonText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14,
    color: '#0F1D3A',
  },
  dragPreviewCanvas: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  toolbar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingTop: 12,
    zIndex: 20,
    elevation: 20,
  },
  toolbarRow: {
    flexDirection: 'row',
  },
  toolbarButton: {
    width: 56,
    height: 56,
    borderRadius: 16,
    marginHorizontal: 7,
    backgroundColor: 'rgba(15, 25, 60, 0.7)',
    borderWidth: 1,
    borderColor: 'rgba(120, 150, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolbarButtonActive: {
    backgroundColor: '#2A4AD6',
    borderColor: '#6C8CFF',
  },
  toolbarButtonActivePan: {
    backgroundColor: '#1F347A',
    borderColor: '#5B7DFF',
  },
  toolbarButtonPressed: {
    transform: [{ scale: 0.97 }],
  },
  timerPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: '#283A86',
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerPillWarn: {
    backgroundColor: '#7A4B1E',
  },
  timerPillDanger: {
    backgroundColor: '#6A2435',
  },
  timerText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 14,
    color: theme.colors.textLight,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  gridViewport: {
    flex: 1,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  winGlow: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#6AA6FF',
  },
  confettiLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: 2,
  },
  confettiPiece: {
    position: 'absolute',
    borderRadius: 4,
    opacity: 0,
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 12, 28, 0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 10,
  },
  modalCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalClose: {
    position: 'absolute',
    right: 14,
    top: 14,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8, 12, 28, 0.6)',
  },
  modalTitle: {
    fontFamily: theme.fonts.title,
    fontSize: 24,
    color: theme.colors.textLight,
  },
  modalSubtitle: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 18,
    color: theme.colors.textLight,
  },
  modalBody: {
    fontFamily: theme.fonts.body,
    fontSize: 14,
    color: theme.colors.textLight,
    textAlign: 'center',
  },
  modalButton: {
    marginTop: 8,
    backgroundColor: '#4CD964',
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 16,
    minWidth: 160,
    alignItems: 'center',
  },
  modalButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  modalButtonText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 16,
    color: '#11222E',
  },
  gestureLayer: {
    flex: 1,
  },
});
