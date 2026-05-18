import { Redirect } from 'expo-router'
import { useAuthStore } from '../store/auth'

export default function Index() {
  const { session, hasCompletedOnboarding, isPremium } = useAuthStore()

  if (!session) return <Redirect href="/(auth)/login" />
  if (!hasCompletedOnboarding) return <Redirect href="/onboarding" />
  if (!isPremium) return <Redirect href="/paywall" />
  return <Redirect href="/(tabs)" />
}
