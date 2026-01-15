import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, View } from 'react-native';
import { type ComponentProps } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { type BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { theme } from '@/constants/theme';

function TabBarIcon(props: {
  name: ComponentProps<typeof MaterialCommunityIcons>['name'];
  focused: boolean;
}) {
  return (
    <MaterialCommunityIcons
      name={props.name}
      size={44}
      color={props.focused ? theme.colors.textLight : '#D9D5FF'}
    />
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: { height: theme.sizes.tabBarHeight + insets.bottom },
      }}>
      <Tabs.Screen
        name="shop"
        options={{
          title: 'Shop',
          tabBarIcon: ({ focused }) => <TabBarIcon name="storefront" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Lobby',
          tabBarIcon: ({ focused }) => <TabBarIcon name="apps" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="shield"
        options={{
          title: 'Shield',
          tabBarIcon: ({ focused }) => <TabBarIcon name="shield" focused={focused} />,
        }}
      />
    </Tabs>
  );
}

function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[theme.colors.tabBarTop, theme.colors.tabBarBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={[
        styles.tabBar,
        {
          height: theme.sizes.tabBarHeight + insets.bottom,
        },
      ]}>
      <View style={styles.tabRow}>
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const { options } = descriptors[route.key];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          const icon = options.tabBarIcon
            ? options.tabBarIcon({
                focused: isFocused,
                color: isFocused ? theme.colors.textLight : '#D9D5FF',
                size: 44,
              })
            : null;

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              style={[
                styles.tabCell,
                { paddingBottom: Math.max(insets.bottom, 8) },
                isFocused && styles.tabCellActive,
              ]}>
              <View style={styles.iconWrap}>{icon}</View>
            </Pressable>
          );
        })}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: theme.sizes.tabBarHeight,
    borderTopWidth: 0,
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  tabRow: {
    flex: 1,
    flexDirection: 'row',
  },
  tabCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 10,
  },
  tabCellActive: {
    backgroundColor: theme.colors.tabBarHighlight,
  },
  iconWrap: {
    marginTop: 6,
  },
});
