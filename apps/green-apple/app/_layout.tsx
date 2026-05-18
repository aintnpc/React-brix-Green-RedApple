import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Animated } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import * as WebBrowser from 'expo-web-browser'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import * as Sentry from '@sentry/react-native'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth'
import { SvgXml } from 'react-native-svg'
import { APPLE_1, APPLE_2, APPLE_3, APPLE_4, APPLE_5 } from '../components/AppleSvgs'
import { setupNotificationHandler, resetReengagement, getNotificationStatus } from '../lib/notifications'
import { configureRevenueCat } from '../lib/iap'

Sentry.init({
  dsn: 'https://91850cf91d209f51c00f3e9e2912f65a@o4511398256640000.ingest.us.sentry.io/4511398257623040',
  environment: __DEV__ ? 'development' : 'production',
  enabled: !__DEV__,
})

SplashScreen.preventAutoHideAsync()
WebBrowser.maybeCompleteAuthSession()
setupNotificationHandler()
configureRevenueCat()

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
})

const queryClient = new QueryClient()

const APPLE_STAGES = [APPLE_1, APPLE_2, APPLE_3, APPLE_4, APPLE_5]
const STAGE_INTERVAL = 300

function SplashOverlay({ onDone }: { onDone: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current
  const [stage, setStage] = useState(0)
  const size = 160
  const height = Math.round(size * (197 / 150))

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    APPLE_STAGES.forEach((_, i) => {
      timers.push(setTimeout(() => setStage(i), i * STAGE_INTERVAL))
    })
    timers.push(
      setTimeout(() => {
        Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => onDone())
      }, APPLE_STAGES.length * STAGE_INTERVAL)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  return (
    <Animated.View style={[splash.root, { opacity: fadeAnim }]}>
      <SvgXml xml={APPLE_STAGES[stage]} width={size} height={height} />
    </Animated.View>
  )
}

const splash = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999,
  },
})

function RootLayoutInner() {
  const { session, restoreSession, hasCompletedOnboarding, isPremium } = useAuthStore()
  const [splashVisible, setSplashVisible] = useState(true)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    restoreSession()
      .finally(() => {
        SplashScreen.hideAsync()
        setIsReady(true)
      })
    getNotificationStatus().then((status) => {
      if (status === 'granted') resetReengagement().catch(() => {})
    })
  }, [])

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, supabaseSession) => {
      if (!supabaseSession) {
        if (isReady) router.replace('/(auth)/login')
        return
      }
      // SIGNED_IN만 처리 — mount 시 restoreSession이 이미 처리하므로 중복 방지
      if (event === 'SIGNED_IN') {
        restoreSession()
      }
    })
    return () => subscription.unsubscribe()
  }, [isReady])

  useEffect(() => {
    if (!isReady) return
    if (session === null) return
    if (!hasCompletedOnboarding) {
      router.replace('/onboarding')
    } else if (!isPremium) {
      router.replace('/paywall')
    } else {
      router.replace('/(tabs)')
    }
  }, [isReady, session?.user?.id, hasCompletedOnboarding, isPremium])

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="paywall" />
        <Stack.Screen name="completion" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="exercise-tracker" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      {splashVisible && <SplashOverlay onDone={() => setSplashVisible(false)} />}
    </>
  )
}

function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <RootLayoutInner />
    </QueryClientProvider>
  )
}

export default Sentry.wrap(RootLayout)
