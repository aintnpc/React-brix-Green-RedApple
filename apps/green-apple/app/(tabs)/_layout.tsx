import { View, TouchableOpacity, StyleSheet, Platform, Text } from 'react-native'
import { Tabs } from 'expo-router'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { colors } from '@repo/theme'
import { useAuthStore } from '../../store/auth'
import { t } from '../../lib/i18n'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

const TABS: { name: string; labelKey: 'tab_home' | 'tab_diet' | 'tab_record' | 'tab_profile'; active: IoniconName; inactive: IoniconName }[] = [
  { name: 'index',   labelKey: 'tab_home',    active: 'home',       inactive: 'home-outline' },
  { name: 'diet',    labelKey: 'tab_diet',    active: 'restaurant', inactive: 'restaurant-outline' },
  { name: 'record',  labelKey: 'tab_record',  active: 'calendar',   inactive: 'calendar-outline' },
  { name: 'profile', labelKey: 'tab_profile', active: 'person',     inactive: 'person-outline' },
]

function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets()

  const visibleRoutes = state.routes.filter(
    (route) => descriptors[route.key]?.options.href !== null,
  )

  return (
    <View style={[styles.outerWrap, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
      <View style={styles.shadow}>
        <BlurView intensity={72} tint="light" style={styles.blur}>
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
                  {/* Active pill background */}
                  {isFocused && <View style={styles.activePill} />}

                  <Ionicons
                    name={isFocused ? tab.active : tab.inactive}
                    size={22}
                    color={isFocused ? colors.textPrimary : 'rgba(60,60,67,0.4)'}
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
  const { isProgramEnded } = useAuthStore()

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        tabBar={(props) => <FloatingTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
        <Tabs.Screen name="index"    options={{ title: t('tab_home') }} />
        <Tabs.Screen name="diet"     options={{ title: t('tab_diet') }} />
        <Tabs.Screen name="record"   options={{ title: t('tab_record') }} />
        <Tabs.Screen name="profile"  options={{ title: t('tab_profile') }} />
      </Tabs>

      {isProgramEnded && (
        <View style={styles.endedOverlay} pointerEvents="box-none">
          <View style={styles.endedBanner} pointerEvents="none">
            <Text style={styles.endedBannerText}>{t('tab_ended_banner')}</Text>
          </View>
        </View>
      )}
    </View>
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
    borderColor: 'rgba(255,255,255,0.6)',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    backgroundColor: Platform.OS === 'android' ? 'rgba(245,245,247,0.96)' : 'rgba(255,255,255,0.3)',
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
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.8)',
  },

  // 프로그램 종료 오버레이 — 탭 콘텐츠 위, 네비게이션 바 아래
  endedOverlay: {
    ...StyleSheet.absoluteFillObject,
    pointerEvents: 'box-none',
  },
  endedBanner: {
    position: 'absolute',
    bottom: 110,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  endedBannerText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
})
