import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Animated } from 'react-native'
import { Stack, router } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as SplashScreen from 'expo-splash-screen'
import * as WebBrowser from 'expo-web-browser'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../store/auth'
import { AppleGauge } from '../components/AppleGauge'
import { setupNotificationHandler, resetReengagement, getNotificationStatus } from '../lib/notifications'
import { configureRevenueCat } from '../lib/iap'

SplashScreen.preventAutoHideAsync()
WebBrowser.maybeCompleteAuthSession()
setupNotificationHandler()
configureRevenueCat()

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
})

const queryClient = new QueryClient()

// Apple animation: 4 transitions × (500ms + 300ms) = 3200ms
const ANIM_DURATION = 1200

function SplashOverlay({ onDone }: { onDone: () => void }) {
  const fadeAnim = useRef(new Animated.Value(1)).current

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, { toValue: 0, duration: 500, useNativeDriver: true }).start(() => onDone())
    }, ANIM_DURATION)
    return () => clearTimeout(timer)
  }, [])

  return (
    <Animated.View style={[splash.root, { opacity: fadeAnim }]}>
      <AppleGauge score={100} size={160} animKey={0} />
    </Animated.View>
  )
}

const splash = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0A0A0A',
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
        <Stack.Screen name="workout" options={{ presentation: 'fullScreenModal' }} />
      </Stack>
      {splashVisible && <SplashOverlay onDone={() => setSplashVisible(false)} />}
    </>
  )
}

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <RootLayoutInner />
    </QueryClientProvider>
  )
}
