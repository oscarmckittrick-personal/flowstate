import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { type ComponentProps, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import levelsData from '@/data/levels.json';
import { theme } from '@/constants/theme';
import {
  clampLevelId,
  getCurrentLevelId,
  resetCurrentLevelId,
  setCurrentLevelId,
} from '@/state/sessionProgress';

type Level = {
  id: number;
  rows: number;
  cols: number;
  preview?: boolean;
};

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const railGlow = useSharedValue(0);
  const badgeAnim = useSharedValue(0);
  const [showGameDebugDot, setShowGameDebugDot] = useState(false);
  const [currentLevelId, setCurrentLevelIdState] = useState(() => getCurrentLevelId());
  const scrollRef = useRef<ScrollView>(null);
  const autoScrollPendingRef = useRef(true);
  const railLayoutYRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollHeightRef = useRef(0);
  const badgeHeightRef = useRef(0);
  const levelCenterOffsetsRef = useRef<Record<number, number>>({});
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    railGlow.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    badgeAnim.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [badgeAnim, railGlow]);
  const orderedLevels = useMemo(
    () => ([...levelsData.levels].sort((a, b) => b.id - a.id) as Level[]),
    []
  );
  const topLevelId = orderedLevels[0]?.id ?? 1;
  const maxLevelId = topLevelId;
  const clampedCurrentLevelId = clampLevelId(currentLevelId, maxLevelId);
  const currentLevel = orderedLevels.find((level) => level.id === clampedCurrentLevelId);
  const activeLevelId = currentLevel?.id ?? topLevelId;

  useFocusEffect(
    useCallback(() => {
      autoScrollPendingRef.current = true;
      const nextId = clampLevelId(getCurrentLevelId(), maxLevelId);
      const resolvedId =
        orderedLevels.find((level) => level.id === nextId)?.id ?? topLevelId;
      setCurrentLevelId(resolvedId);
      setCurrentLevelIdState(resolvedId);
      setLayoutVersion((prev) => prev + 1);
    }, [maxLevelId, orderedLevels, topLevelId])
  );
  const headerFadeHeight = theme.sizes.topBarHeight + insets.top + 48;
  const badgeHeight = 64;
  const levelsBottomPad = theme.sizes.tabBarHeight + insets.bottom + badgeHeight + 44;
  const badgeBottomOffset = theme.sizes.tabBarHeight + insets.bottom + 26;
  const bottomFadeHeight = badgeBottomOffset;
  const levelsTopPad = 16;
  const debugDotTop = insets.top + theme.sizes.topBarHeight + 6;
  const railLevels: Level[] = [
    {
      id: topLevelId + 1,
      rows: 0,
      cols: 0,
      preview: true,
    },
    ...orderedLevels,
  ];
  const railGlowStyle = useAnimatedStyle(() => ({
    opacity: interpolate(railGlow.value, [0, 1], [0.5, 1]),
  }));
  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    opacity: badgeAnim.value,
    transform: [{ scale: interpolate(badgeAnim.value, [0, 1], [0.9, 1]) }],
  }));
  const bumpLayout = useCallback(() => {
    setLayoutVersion((prev) => prev + 1);
  }, []);
  const handleRailLayout = useCallback(
    (event: { nativeEvent: { layout: LayoutRectangle } }) => {
      railLayoutYRef.current = event.nativeEvent.layout.y;
      bumpLayout();
    },
    [bumpLayout]
  );
  const handleBadgeLayout = useCallback(
    (event: { nativeEvent: { layout: LayoutRectangle } }) => {
      badgeHeightRef.current = event.nativeEvent.layout.height;
      bumpLayout();
    },
    [bumpLayout]
  );
  const handleScrollLayout = useCallback(
    (event: { nativeEvent: { layout: LayoutRectangle } }) => {
      scrollHeightRef.current = event.nativeEvent.layout.height;
      bumpLayout();
    },
    [bumpLayout]
  );
  const handleContentSizeChange = useCallback(
    (_width: number, height: number) => {
      contentHeightRef.current = height;
      bumpLayout();
    },
    [bumpLayout]
  );
  const handleLevelLayout = useCallback(
    (levelId: number, layout: LayoutRectangle) => {
      levelCenterOffsetsRef.current[levelId] = layout.y + theme.sizes.levelNode / 2;
      bumpLayout();
    },
    [bumpLayout]
  );

  const goToLevel = useCallback(
    (levelId: number, extraParams?: Record<string, string>) => {
      const nextId = clampLevelId(levelId, maxLevelId);
      setCurrentLevelId(nextId);
      setCurrentLevelIdState(nextId);
      router.push({
        pathname: '/game',
        params: {
          levelId: String(nextId),
          showDebugDot: showGameDebugDot ? '1' : '0',
          ...extraParams,
        },
      });
    },
    [maxLevelId, router, showGameDebugDot]
  );

  const resetProgress = useCallback(() => {
    resetCurrentLevelId();
    const nextId = clampLevelId(1, maxLevelId);
    setCurrentLevelId(nextId);
    setCurrentLevelIdState(nextId);
  }, [maxLevelId]);

  const showDebugMenu = useCallback(() => {
    const targetLevelId = activeLevelId;
    Alert.alert('Debug', undefined, [
      { text: 'Reset Game', onPress: resetProgress },
      {
        text: `Game Debug Dot: ${showGameDebugDot ? 'On' : 'Off'}`,
        onPress: () => setShowGameDebugDot((prev) => !prev),
      },
      {
        text: 'Level Win',
        onPress: () => goToLevel(targetLevelId, { debug: 'win' }),
      },
      {
        text: 'Level Fail',
        onPress: () => goToLevel(targetLevelId, { debug: 'fail' }),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [activeLevelId, goToLevel, resetProgress, showGameDebugDot]);

  useEffect(() => {
    if (!autoScrollPendingRef.current) return;
    const contentHeight = contentHeightRef.current;
    const scrollHeight = scrollHeightRef.current;
    const nodeOffset = levelCenterOffsetsRef.current[activeLevelId];
    if (!contentHeight || !scrollHeight || nodeOffset == null) return;
    const resolvedBadgeHeight = badgeHeightRef.current || badgeHeight;
    const anchorY = scrollHeight - resolvedBadgeHeight - 80;
    if (!Number.isFinite(anchorY)) return;
    const targetY = railLayoutYRef.current + nodeOffset - anchorY;
    const maxScroll = Math.max(0, contentHeight - scrollHeight);
    const clampedY = Math.max(0, Math.min(targetY, maxScroll));
    scrollRef.current?.scrollTo({ y: clampedY, animated: false });
    autoScrollPendingRef.current = false;
  }, [activeLevelId, badgeBottomOffset, badgeHeight, layoutVersion]);

  return (
    <LinearGradient
      colors={[theme.colors.backgroundTop, theme.colors.backgroundMid, theme.colors.backgroundBottom]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.container}>
      <View style={styles.levelsLayer}>
        <ScrollView
          ref={scrollRef}
          style={[styles.levelsScroll, { bottom: badgeBottomOffset }]}
          contentContainerStyle={[
            styles.levelsContent,
            { paddingBottom: levelsBottomPad, paddingTop: levelsTopPad },
          ]}
          showsVerticalScrollIndicator={false}
          onLayout={handleScrollLayout}
          onContentSizeChange={handleContentSizeChange}
          onScrollBeginDrag={() => {
            autoScrollPendingRef.current = false;
          }}
          scrollEventThrottle={16}>
          <View style={styles.levelRail} onLayout={handleRailLayout}>
            {railLevels.map((level, index) => (
              <View
                key={level.preview ? `preview-${level.id}` : level.id}
                style={styles.levelGroup}
                onLayout={(event) => {
                  if (!level.preview) {
                    handleLevelLayout(level.id, event.nativeEvent.layout);
                  }
                }}>
                <LevelNode
                  level={level}
                  isCurrent={!level.preview && level.id === activeLevelId}
                  onPress={() => {
                    if (!level.preview) {
                      goToLevel(level.id);
                    }
                  }}
                />
                {index < railLevels.length - 1 ? (
                  <AnimatedLinearGradient
                    colors={[theme.colors.railGlow, theme.colors.rail]}
                    style={[styles.levelConnector, railGlowStyle]}
                  />
                ) : null}
              </View>
            ))}
          </View>

        </ScrollView>

        <LinearGradient
          colors={['transparent', theme.colors.backgroundBottom]}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.bottomFade, { height: bottomFadeHeight }]}
          pointerEvents="none"
        />

        <View style={[styles.levelBadgeWrap, { bottom: badgeBottomOffset }]}>
          <Animated.View style={badgeAnimatedStyle}>
            <Pressable
              onPress={() => {
                goToLevel(activeLevelId);
              }}
              style={({ pressed }) => [pressed && styles.levelBadgePressed]}>
              <LinearGradient
                colors={[theme.colors.currentTop, theme.colors.currentBottom]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.levelBadge}
                onLayout={handleBadgeLayout}>
                <Text style={styles.levelBadgeText}>Level {activeLevelId}</Text>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>

      <View style={[styles.headerLayer, { paddingTop: insets.top + 10 }]} pointerEvents="box-none">
        <LinearGradient
          colors={[theme.colors.backgroundTop, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={[styles.headerFade, { height: headerFadeHeight }]}
          pointerEvents="none"
        />
        <View style={styles.topBar}>
          <Pressable style={styles.avatar}>
            <MaterialCommunityIcons name="account" size={28} color={theme.colors.white} />
          </Pressable>

          <View style={styles.statsRow}>
          <StatPill icon="cash" value="678" accentColor={theme.colors.coin} />
            <StatPill icon="heart" value="4/5" accentColor={theme.colors.heart} />
          </View>

          <Pressable style={styles.settings}>
            <MaterialCommunityIcons name="cog" size={24} color={theme.colors.white} />
          </Pressable>
        </View>
        <Pressable
          onPress={showDebugMenu}
          hitSlop={12}
          style={[styles.debugDot, { top: debugDotTop }]}
        />
      </View>
    </LinearGradient>
  );
}


function StatPill({
  icon,
  value,
  accentColor,
  showPlus = false,
}: {
  icon: ComponentProps<typeof MaterialCommunityIcons>['name'];
  value: string;
  accentColor: string;
  showPlus?: boolean;
}) {
  return (
    <LinearGradient colors={['#2E3E86', '#2A3B7C']} style={styles.statPill}>
      <View style={[styles.statIcon, { backgroundColor: accentColor }]}>
        <MaterialCommunityIcons name={icon} size={18} color="#fff" />
      </View>
      <Text style={styles.statText}>{value}</Text>
      {showPlus ? (
        <MaterialCommunityIcons name="plus-circle" size={18} color="#2FD07A" />
      ) : null}
    </LinearGradient>
  );
}

function LevelNode({
  level,
  isCurrent,
  onPress,
}: {
  level: Level;
  isCurrent: boolean;
  onPress?: () => void;
}) {
  const isPreview = Boolean(level.preview);
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (!isCurrent) {
      pulse.value = 0;
      return;
    }
    pulse.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [isCurrent, pulse]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: isCurrent ? interpolate(pulse.value, [0, 1], [1, 1.04]) : 1 }],
  }));

  const node = (
    <Animated.View style={pulseStyle}>
      <LinearGradient
        colors={
          isCurrent
            ? [theme.colors.currentTop, theme.colors.currentBottom]
            : [theme.colors.locked, theme.colors.lockedDark]
        }
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={[styles.levelNode, isPreview && styles.levelNodePreview]}>
        <Text style={[styles.levelNumber, !isCurrent && styles.levelNumberLocked]}>
          {level.id}
        </Text>
      </LinearGradient>
    </Animated.View>
  );

  return (
    <View style={styles.levelNodeWrap}>
      {!isPreview && onPress ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [pressed && styles.nodePressed]}>
          {node}
        </Pressable>
      ) : (
        <View>{node}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  levelsLayer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  levelsScroll: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  bottomFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1,
  },
  levelBadgeWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2,
  },
  topBar: {
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  headerFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  debugDot: {
    position: 'absolute',
    right: 18,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF3B30',
    zIndex: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#2E3E86',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.cardShadow,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  settings: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2A3B7C',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.cardShadow,
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 18,
    gap: 6,
    backgroundColor: '#EAF2FF',
    shadowColor: theme.colors.cardShadow,
    shadowOpacity: 0.2,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 3 },
  },
  statIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statText: {
    fontFamily: theme.fonts.bodyBold,
    fontSize: 16,
    color: theme.colors.textLight,
  },
  levelsContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  levelRail: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  levelGroup: {
    alignItems: 'center',
  },
  levelConnector: {
    width: 10,
    height: 64,
    borderRadius: 5,
    marginTop: 8,
  },
  levelNodeWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  levelNode: {
    width: theme.sizes.levelNode,
    height: theme.sizes.levelNode,
    borderRadius: theme.sizes.levelRadius,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: theme.colors.cardShadow,
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
  },
  levelNodePreview: {
    opacity: 0.4,
  },
  nodePressed: {
    transform: [{ scale: 0.97 }],
  },
  levelNumber: {
    fontFamily: theme.fonts.title,
    fontSize: 40,
    color: theme.colors.white,
    textShadowColor: '#00000055',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 3,
  },
  levelNumberLocked: {
    color: '#E1E5F2',
  },
  levelBadge: {
    marginTop: 20,
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 22,
    shadowColor: theme.colors.cardShadow,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  levelBadgePressed: {
    transform: [{ scale: 0.98 }],
  },
  levelBadgeText: {
    fontFamily: theme.fonts.title,
    fontSize: 26,
    color: theme.colors.textLight,
    letterSpacing: 0.5,
  },
});
