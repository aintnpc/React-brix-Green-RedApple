import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as WebBrowser from 'expo-web-browser'
import * as Linking from 'expo-linking'
import * as AppleAuthentication from 'expo-apple-authentication'
import { GoogleSignin } from '@react-native-google-signin/google-signin'
import * as Crypto from 'expo-crypto'
import type { UserProfile, BodyInfo, DailyNutritionGoal } from '@repo/shared'
import { calculateTDEE } from '@repo/shared'

import Purchases from 'react-native-purchases'

import { supabase } from '../lib/supabase'
import { identifyUser, getActivePlan } from '../lib/iap'
import { useDietStore } from './diet'
import { useExerciseLogStore } from './exerciseLog'
import { useWeightLogStore } from './weightLog'
import { type UnitSystem, getDefaultUnitSystem } from '../lib/locale'

export type PlanType = '1week' | '2week' | '2week_x3'
export type { UnitSystem }

interface AuthState {
  session: { access_token: string; refresh_token: string; user: UserProfile } | null
  bodyInfo: BodyInfo | null
  macroGoals: DailyNutritionGoal | null
  hasCompletedOnboarding: boolean
  isPremium: boolean
  selectedPlan: PlanType | null
  programStartedAt: string | null
  remainingSessions: number | null
  isProgramEnded: boolean
  unitSystem: UnitSystem

  signInWithKakao: () => Promise<void>
  signInWithGoogle: () => Promise<void>
  signInWithApple: () => Promise<void>
  signOut: () => Promise<void>
  setBodyInfo: (info: BodyInfo, macros: DailyNutritionGoal) => Promise<void>
  setNickname: (nickname: string) => Promise<void>
  setProgramEnded: () => Promise<void>
  setPremium: (plan: PlanType) => Promise<void>
  consumeSession: () => Promise<void>
  redeemPromoCode: () => Promise<{ ok: boolean }>
  restoreSession: () => Promise<void>
  setUnitSystem: (unit: UnitSystem) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      session: null,
      bodyInfo: null,
      macroGoals: null,
      hasCompletedOnboarding: false,
      isPremium: false,
      selectedPlan: null,
      programStartedAt: null,
      remainingSessions: null,
      isProgramEnded: false,
      unitSystem: getDefaultUnitSystem(),

      setUnitSystem: (unit) => set({ unitSystem: unit }),

      signInWithGoogle: async () => {
        try { await GoogleSignin.revokeAccess() } catch {}
        try { await GoogleSignin.signOut() } catch {}
        const rawNonce = Array.from(Crypto.getRandomBytes(16))
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        const hashedNonce = await Crypto.digestStringAsync(
          Crypto.CryptoDigestAlgorithm.SHA256,
          rawNonce
        )
        await GoogleSignin.hasPlayServices()
        const userInfo = await (GoogleSignin.signIn as any)({ nonce: hashedNonce })
        const idToken = userInfo.data?.idToken
        if (!idToken) throw new Error('Google ID token을 받지 못했어요.')
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'google',
          token: idToken,
          nonce: rawNonce,
        })
        if (error) throw error
      },

      signInWithApple: async () => {
        const credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        })
        if (!credential.identityToken) throw new Error('Apple identity token을 받지 못했어요.')
        const { error } = await supabase.auth.signInWithIdToken({
          provider: 'apple',
          token: credential.identityToken,
        })
        if (error) throw error
      },

      signInWithKakao: async () => {
        const redirectTo = Linking.createURL('auth/callback')

        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'kakao',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            scopes: 'account_email profile_nickname profile_image',
          },
        })

        if (error || !data.url) throw error ?? new Error('OAuth URL 생성 실패')

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

        if (result.type !== 'success') return

        const hashString = result.url.split('#')[1] ?? ''
        const hashParams = Object.fromEntries(new URLSearchParams(hashString))

        if (hashParams.error) {
          throw new Error(hashParams.error_description ?? hashParams.error)
        }

        const accessToken = hashParams.access_token
        const refreshToken = hashParams.refresh_token
        if (!accessToken || !refreshToken) throw new Error('토큰을 받지 못했어요.')

        const { data: sessionData, error: sessionError } =
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        if (sessionError) throw sessionError

        const sess = sessionData.session
        if (!sess) throw new Error('세션을 받지 못했어요.')
        const u = sess.user
        set({
          session: {
            access_token: sess.access_token,
            refresh_token: sess.refresh_token,
            user: {
              id: u.id,
              email: u.email ?? '',
              name: u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email ?? '',
              avatar_url: u.user_metadata?.avatar_url,
              created_at: u.created_at,
            },
          },
        })
      },

      signOut: async () => {
        await supabase.auth.signOut()
        try { await GoogleSignin.signOut() } catch {}
        set({ session: null, hasCompletedOnboarding: false, bodyInfo: null, macroGoals: null, isPremium: false, selectedPlan: null, programStartedAt: null, isProgramEnded: false })
      },

      setBodyInfo: async (info, macros) => {
        const programStartedAt = new Date().toISOString()
        set({ bodyInfo: info, macroGoals: macros, hasCompletedOnboarding: true, programStartedAt })
        const state = useAuthStore.getState()
        const userId = state.session?.user?.id
        if (!userId) {
          console.warn('[setBodyInfo] no session user, skipping DB save')
          return
        }
        const { error } = await supabase.from('profiles').upsert({
          id: userId,
          email: state.session?.user?.email ?? null,
          name: state.session?.user?.name ?? null,
          height: info.height,
          weight: info.weight,
          age: info.age,
          gender: info.gender,
          goal: info.goal,
          activity_level: info.activity_level,
          target_weight: info.target_weight ?? null,
          target_days: info.target_days ?? null,
          exercise_minutes_per_day: info.exercise_minutes_per_day ?? 30,
          tdee: calculateTDEE(info),
          daily_calorie_goal: macros.calories,
          macro_carbs: macros.carbs,
          macro_protein: macros.protein,
          macro_fat: macros.fat,
          has_completed_onboarding: true,
          program_started_at: programStartedAt,
        })
        if (error) console.error('[setBodyInfo] upsert error:', error)
      },

      setNickname: async (nickname) => {
        set((state) => ({
          session: state.session ? { ...state.session, user: { ...state.session.user, name: nickname } } : null,
        }))
        const userId = useAuthStore.getState().session?.user?.id
        if (!userId) return
        const { error } = await supabase.from('profiles').update({ nickname }).eq('id', userId)
        if (error) console.error('[setNickname] DB error:', error)
      },

      setProgramEnded: async () => {
        set({ isProgramEnded: true })
        const userId = useAuthStore.getState().session?.user?.id
        if (!userId) return
        const { error } = await supabase.from('profiles').update({ is_program_ended: true }).eq('id', userId)
        if (error) console.error('[setProgramEnded] DB error:', error)
      },

      setPremium: async (plan) => {
        const programStartedAt = new Date().toISOString()
        const days = plan === '1week' ? 7 : 14
        const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        if (plan === '2week_x3') {
          // 소모품: remaining_sessions 조회 후 +3 (재구매 누적)
          const { data: profile } = await supabase
            .from('profiles')
            .select('remaining_sessions')
            .eq('id', user.id)
            .single()
          const current = profile?.remaining_sessions ?? 0
          const newSessions = current + 3
          set({ isPremium: true, selectedPlan: plan, programStartedAt, remainingSessions: newSessions })
          await supabase.from('profiles').update({
            is_premium: true,
            selected_plan: plan,
            program_started_at: programStartedAt,
            plan_expires_at: expiresAt,
            remaining_sessions: newSessions,
          }).eq('id', user.id)
        } else {
          set({ isPremium: true, selectedPlan: plan, programStartedAt, remainingSessions: null })
          await supabase.from('profiles').update({
            is_premium: true,
            selected_plan: plan,
            program_started_at: programStartedAt,
            plan_expires_at: expiresAt,
          }).eq('id', user.id)
        }
      },

      consumeSession: async () => {
        const state = useAuthStore.getState()
        if (state.selectedPlan !== '2week_x3') return
        const userId = state.session?.user?.id
        if (!userId) return

        const remaining = (state.remainingSessions ?? 1) - 1
        if (remaining <= 0) {
          // 세션 소진 → premium 해제
          set({ isPremium: false, remainingSessions: 0, selectedPlan: null, programStartedAt: null })
          await supabase.from('profiles').update({
            is_premium: false,
            remaining_sessions: 0,
            selected_plan: null,
            program_started_at: null,
          }).eq('id', userId)
        } else {
          set({ remainingSessions: remaining, programStartedAt: null })
          await supabase.from('profiles').update({
            remaining_sessions: remaining,
            program_started_at: null,
          }).eq('id', userId)
        }
      },

      redeemPromoCode: async () => {
        Purchases.presentCodeRedemptionSheet()
        return { ok: true }
      },

      restoreSession: async () => {
        const { data } = await supabase.auth.getSession()
        if (!data.session) return
        const u = data.session.user

        const { data: profile } = await supabase
          .from('profiles')
          .select('name, nickname, has_completed_onboarding, is_premium, selected_plan, program_started_at, plan_expires_at, remaining_sessions, is_program_ended, height, weight, age, gender, goal, activity_level, target_weight, target_days, exercise_minutes_per_day, tdee, daily_calorie_goal, macro_carbs, macro_protein, macro_fat')
          .eq('id', u.id)
          .single()

        const bodyInfo = profile?.height ? {
          user_id: u.id,
          height: profile.height,
          weight: profile.weight,
          age: profile.age,
          gender: profile.gender,
          goal: profile.goal,
          activity_level: profile.activity_level,
          target_weight: profile.target_weight ?? undefined,
          target_days: profile.target_days ?? undefined,
          exercise_minutes_per_day: profile.exercise_minutes_per_day ?? 30,
        } : null

        const macroGoals = profile?.daily_calorie_goal ? {
          calories: profile.daily_calorie_goal,
          carbs: profile.macro_carbs,
          protein: profile.macro_protein,
          fat: profile.macro_fat,
        } : null

        // RC로 유저 식별 후 실제 구매 상태 검증 (환불/만료 자동 반영)
        await identifyUser(u.id)
        const activePlan = await getActivePlan()

        // plan_expires_at 만료 여부 확인
        const planExpiresAt = profile?.plan_expires_at ?? null
        const isExpired = planExpiresAt ? new Date(planExpiresAt) < new Date() : false

        // RC에 구매 내역 있으면 RC 기준, 없으면 DB 기준 (첫 심사 전 product 미활성 상태 대응)
        // 단, DB 기준이더라도 만료됐으면 false
        let isPremium = activePlan !== null ? true : ((profile?.is_premium ?? false) && !isExpired)
        if (activePlan !== null && !profile?.is_premium) {
          await supabase.from('profiles').update({ is_premium: true }).eq('id', u.id)
        }
        // RC에도 없고 DB 기준으로 만료된 경우 DB도 정리
        if (activePlan === null && profile?.is_premium && isExpired) {
          await supabase.from('profiles').update({ is_premium: false }).eq('id', u.id)
        }

        set({
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
            user: {
              id: u.id,
              email: u.email ?? '',
              name: profile?.nickname ?? profile?.name ?? u.user_metadata?.full_name ?? u.user_metadata?.name ?? u.email ?? '',
              avatar_url: u.user_metadata?.avatar_url,
              created_at: u.created_at,
            },
          },
          hasCompletedOnboarding: profile?.has_completed_onboarding ?? false,
          isPremium,
          selectedPlan: profile?.selected_plan ?? null,
          programStartedAt: profile?.program_started_at ?? null,
          remainingSessions: profile?.remaining_sessions ?? null,
          isProgramEnded: profile?.is_program_ended ?? false,
          ...(bodyInfo && { bodyInfo }),
          ...(macroGoals && { macroGoals }),
        })

        await Promise.all([
          useDietStore.getState().syncFromDB(u.id),
          useExerciseLogStore.getState().syncFromDB(u.id),
          useWeightLogStore.getState().syncFromDB(u.id, profile?.program_started_at),
        ])
      },
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // session은 supabase가 직접 관리하므로 persist에서 제외
      partialize: (state) => ({
        isPremium: state.isPremium,
        selectedPlan: state.selectedPlan,
        bodyInfo: state.bodyInfo,
        macroGoals: state.macroGoals,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
        isProgramEnded: state.isProgramEnded,
        unitSystem: state.unitSystem,
      }),
    }
  )
)
