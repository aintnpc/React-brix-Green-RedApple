import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native'
import { Tabs } from 'expo-router'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colorsDark as colors } from '@repo/theme'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const TABS: { name: string; label: string; active: IoniconName; inactive: IoniconName }[] = [
  { name: 'index',    label: '홈',    active: 'home',         inactive: 'home-outline' },
  { name: 'exercise', label: '운동',  active: 'barbell',      inactive: 'barbell-outline' },
  { name: 'diet',     label: '식단',  active: 'restaurant',   inactive: 'restaurant-outline' },
  { name: 'record',   label: '기록',  active: 'calendar',     inactive: 'calendar-outline' },
  { name: 'profile',  label: '프로필', active: 'person',      inactive: 'person-outline' },
]

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()

  const visibleRoutes = state.routes.filter(
    (route) => descriptors[route.key]?.options.href !== null,
  )

  return (
    <View style={[styles.outerWrap, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.shadow}>
        <BlurView intensity={60} tint="dark" style={styles.blur}>
          <View style={styles.inner}>
            {visibleRoutes.map((route) => {
              const isFocused = state.index === state.routes.indexOf(route)
              const tab = TABS.find((t) => t.name === route.name)
              if (!tab) return null

              const onPress = () => {
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
                if (!isFocused && !event.defaultPrevented) {
                  navigation.navigate(route.name)
                }
              }

              return (
                <TouchableOpacity
                  key={route.key}
                  onPress={onPress}
                  activeOpacity={0.75}
                  style={styles.tabItem}
                  accessibilityRole="button"
                  accessibilityState={isFocused ? { selected: true } : {}}
                >
                  {isFocused && <View style={styles.activePill} />}

                  <Ionicons
                    name={isFocused ? tab.active : tab.inactive}
                    size={22}
                    color={isFocused ? colors.mint : 'rgba(255,255,255,0.3)'}
                  />
                </TouchableOpacity>
              )
            })}
          </View>
        </BlurView>
      </View>
    </View>
  )
}

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index"    options={{ title: '홈' }} />
      <Tabs.Screen name="exercise" options={{ title: '운동' }} />
      <Tabs.Screen name="diet"     options={{ title: '식단' }} />
      <Tabs.Screen name="record"   options={{ title: '기록' }} />
      <Tabs.Screen name="profile"  options={{ title: '프로필' }} />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  outerWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    alignItems: 'center',
  },
  shadow: {
    width: '100%',
    borderRadius: 30,
    // iOS shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 24,
    // Android
    elevation: 16,
  },
  blur: {
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: Platform.OS === 'android' ? 'rgba(18,18,18,0.97)' : 'rgba(20,20,20,0.5)',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 22,
    minHeight: 44,
  },
  activePill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(232,59,59,0.15)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(232,59,59,0.3)',
  },
})
