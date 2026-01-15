import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { type ComponentProps, useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
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

type LevelStatus = 'current' | 'locked';

type Level = {
  id: number;
  rows: number;
  cols: number;
  status: LevelStatus;
  preview?: boolean;
};

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function LobbyScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const drift = useSharedValue(0);
  const railGlow = useSharedValue(0);
  const badgeAnim = useSharedValue(0);

  useEffect(() => {
    drift.value = withRepeat(
      withTiming(1, { duration: 8000, easing: Easing.linear }),
      -1,
      false
    );
    railGlow.value = withRepeat(
      withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    badgeAnim.value = withTiming(1, { duration: 260, easing: Easing.out(Easing.cubic) });
  }, [badgeAnim, drift, railGlow]);
  const [levels, setLevels] = useState<Level[]>([]);
  const unlockAllLevels = useCallback(() => {
    levelsData.levels.forEach((level) => {
      level.status = 'current';
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      unlockAllLevels();
      setLevels([...levelsData.levels].sort((a, b) => b.id - a.id) as Level[]);
    }, [unlockAllLevels])
  );

  const orderedLevels =
    levels.length > 0
      ? levels
      : ([...levelsData.levels].sort((a, b) => b.id - a.id) as Level[]);
  const currentLevel =
    orderedLevels.find((level) => level.status === 'current') ?? orderedLevels[0];
  const topLevelId = orderedLevels[0]?.id ?? 1;
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
      status: 'locked',
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

  const refreshLevels = useCallback(() => {
    setLevels([...levelsData.levels].sort((a, b) => b.id - a.id) as Level[]);
  }, []);

  const resetProgress = useCallback(() => {
    unlockAllLevels();
    refreshLevels();
  }, [refreshLevels, unlockAllLevels]);

  const handleUnlockAllLevels = useCallback(() => {
    unlockAllLevels();
    refreshLevels();
  }, [refreshLevels, unlockAllLevels]);

  const showDebugMenu = useCallback(() => {
    const targetLevelId = currentLevel?.id ?? 1;
    Alert.alert('Debug', undefined, [
      { text: 'Reset Game', onPress: resetProgress },
      { text: 'Unlock All Levels', onPress: handleUnlockAllLevels },
      {
        text: 'Level Win',
        onPress: () => {
          router.push({
            pathname: '/game',
            params: { levelId: String(targetLevelId), debug: 'win' },
          });
        },
      },
      {
        text: 'Level Fail',
        onPress: () => {
          router.push({
            pathname: '/game',
            params: { levelId: String(targetLevelId), debug: 'fail' },
          });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [currentLevel?.id, handleUnlockAllLevels, resetProgress, router]);

  return (
    <LinearGradient
      colors={[theme.colors.backgroundTop, theme.colors.backgroundMid, theme.colors.backgroundBottom]}
      start={{ x: 0.3, y: 0 }}
      end={{ x: 0.8, y: 1 }}
      style={styles.container}>
      <DotField drift={drift} />

      <View style={styles.levelsLayer}>
        <ScrollView
          style={[styles.levelsScroll, { bottom: badgeBottomOffset }]}
          contentContainerStyle={[
            styles.levelsContent,
            { paddingBottom: levelsBottomPad, paddingTop: levelsTopPad },
          ]}
          showsVerticalScrollIndicator={false}>
          <View style={styles.levelRail}>
            {railLevels.map((level, index) => (
              <View
                key={level.preview ? `preview-${level.id}` : level.id}
                style={styles.levelGroup}>
                <LevelNode
                  level={level}
                  onPress={() => {
                    if (!level.preview && level.status === 'current') {
                      router.push({ pathname: '/game', params: { levelId: String(level.id) } });
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
                if (currentLevel) {
                  router.push({ pathname: '/game', params: { levelId: String(currentLevel.id) } });
                }
              }}
              style={({ pressed }) => [pressed && styles.levelBadgePressed]}>
              <LinearGradient
                colors={[theme.colors.currentTop, theme.colors.currentBottom]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.levelBadge}>
                <Text style={styles.levelBadgeText}>Level {currentLevel?.id}</Text>
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

function DotField({ drift }: { drift: Animated.SharedValue<number> }) {
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.value * -200 }],
  }));
  const animatedOffsetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: drift.value * -200 + 200 }],
  }));

  return (
    <View style={styles.dotField} pointerEvents="none">
      <Animated.View style={[styles.dotGroup, animatedStyle]}>
        {dotPositions.map((dot) => (
          <View
            key={`a-${dot.key}`}
            style={[
              styles.dot,
              {
                left: dot.x,
                top: dot.y,
                opacity: dot.opacity,
                transform: [{ scale: dot.scale }],
              },
            ]}
          />
        ))}
      </Animated.View>
      <Animated.View style={[styles.dotGroup, animatedOffsetStyle]}>
        {dotPositions.map((dot) => (
          <View
            key={`b-${dot.key}`}
            style={[
              styles.dot,
              {
                left: dot.x,
                top: dot.y,
                opacity: dot.opacity,
                transform: [{ scale: dot.scale }],
              },
            ]}
          />
        ))}
      </Animated.View>
    </View>
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
  onPress,
}: {
  level: Level;
  onPress?: () => void;
}) {
  const isPreview = Boolean(level.preview);
  const isCurrent = level.status === 'current' && !isPreview;
  const showLock = !isCurrent;
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
      {isCurrent ? (
        <Pressable
          onPress={onPress}
          style={({ pressed }) => [pressed && styles.nodePressed]}>
          {node}
        </Pressable>
      ) : (
        <View>{node}</View>
      )}
      {showLock ? (
        <View style={[styles.lockBadge, isPreview && styles.lockBadgePreview]}>
          <MaterialCommunityIcons name="lock" size={18} color="#fff" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dotField: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  dotGroup: {
    ...StyleSheet.absoluteFillObject,
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#7C9BFF',
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
  lockBadge: {
    position: 'absolute',
    right: -10,
    bottom: -6,
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#F49B2E',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FDD18B',
  },
  lockBadgePreview: {
    opacity: 0.5,
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

const dotPositions = [
  { key: 'd1', x: '12%', y: '18%', opacity: 0.15, scale: 0.7 },
  { key: 'd2', x: '22%', y: '64%', opacity: 0.12, scale: 0.6 },
  { key: 'd3', x: '35%', y: '38%', opacity: 0.2, scale: 0.8 },
  { key: 'd4', x: '46%', y: '78%', opacity: 0.1, scale: 0.5 },
  { key: 'd5', x: '58%', y: '22%', opacity: 0.16, scale: 0.7 },
  { key: 'd6', x: '70%', y: '55%', opacity: 0.12, scale: 0.6 },
  { key: 'd7', x: '82%', y: '32%', opacity: 0.18, scale: 0.9 },
  { key: 'd8', x: '88%', y: '68%', opacity: 0.1, scale: 0.5 },
  { key: 'd9', x: '14%', y: '86%', opacity: 0.08, scale: 0.5 },
  { key: 'd10', x: '64%', y: '10%', opacity: 0.14, scale: 0.6 },
  { key: 'd11', x: '40%', y: '12%', opacity: 0.12, scale: 0.5 },
  { key: 'd12', x: '76%', y: '90%', opacity: 0.1, scale: 0.6 },
  { key: 'd13', x: '6%', y: '28%', opacity: 0.12, scale: 0.6 },
  { key: 'd14', x: '18%', y: '48%', opacity: 0.1, scale: 0.5 },
  { key: 'd15', x: '28%', y: '72%', opacity: 0.14, scale: 0.7 },
  { key: 'd16', x: '32%', y: '90%', opacity: 0.08, scale: 0.5 },
  { key: 'd17', x: '48%', y: '6%', opacity: 0.12, scale: 0.6 },
  { key: 'd18', x: '52%', y: '46%', opacity: 0.1, scale: 0.5 },
  { key: 'd19', x: '56%', y: '84%', opacity: 0.12, scale: 0.6 },
  { key: 'd20', x: '62%', y: '34%', opacity: 0.15, scale: 0.7 },
  { key: 'd21', x: '68%', y: '74%', opacity: 0.1, scale: 0.5 },
  { key: 'd22', x: '74%', y: '16%', opacity: 0.12, scale: 0.6 },
  { key: 'd23', x: '84%', y: '50%', opacity: 0.1, scale: 0.5 },
  { key: 'd24', x: '92%', y: '20%', opacity: 0.12, scale: 0.6 },
  { key: 'd25', x: '94%', y: '82%', opacity: 0.1, scale: 0.5 },
  { key: 'd26', x: '10%', y: '6%', opacity: 0.12, scale: 0.6 },
  { key: 'd27', x: '26%', y: '24%', opacity: 0.1, scale: 0.5 },
  { key: 'd28', x: '36%', y: '56%', opacity: 0.12, scale: 0.6 },
  { key: 'd29', x: '44%', y: '66%', opacity: 0.1, scale: 0.5 },
  { key: 'd30', x: '60%', y: '92%', opacity: 0.08, scale: 0.5 },
  { key: 'd31', x: '78%', y: '8%', opacity: 0.12, scale: 0.6 },
  { key: 'd32', x: '86%', y: '40%', opacity: 0.1, scale: 0.5 },
  { key: 'd33', x: '90%', y: '58%', opacity: 0.12, scale: 0.6 },
  { key: 'd34', x: '96%', y: '38%', opacity: 0.1, scale: 0.5 },
  { key: 'd35', x: '4%', y: '58%', opacity: 0.12, scale: 0.6 },
  { key: 'd36', x: '8%', y: '74%', opacity: 0.1, scale: 0.5 },
  { key: 'd37', x: '20%', y: '8%', opacity: 0.12, scale: 0.6 },
  { key: 'd38', x: '24%', y: '92%', opacity: 0.08, scale: 0.5 },
  { key: 'd39', x: '54%', y: '60%', opacity: 0.12, scale: 0.6 },
  { key: 'd40', x: '66%', y: '26%', opacity: 0.1, scale: 0.5 },
  { key: 'd41', x: '72%', y: '92%', opacity: 0.08, scale: 0.5 },
  { key: 'd42', x: '80%', y: '70%', opacity: 0.1, scale: 0.5 },
  { key: 'd43', x: '86%', y: '12%', opacity: 0.12, scale: 0.6 },
  { key: 'd44', x: '92%', y: '44%', opacity: 0.1, scale: 0.5 },
  { key: 'd45', x: '96%', y: '64%', opacity: 0.1, scale: 0.5 },
];
