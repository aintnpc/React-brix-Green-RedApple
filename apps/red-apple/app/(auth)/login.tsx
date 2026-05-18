import { useEffect, useRef } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, Animated, Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { SvgXml } from 'react-native-svg'
import { APPLE_1 } from '../../components/AppleSvgs'
import { useAuthStore } from '../../store/auth'
import { router } from 'expo-router'

const TERMS_URL = 'https://fresh-scourge-530.notion.site/34e017466a0381a0b1b9c27017a05933'
const PRIVACY_URL = 'https://fresh-scourge-530.notion.site/34e017466a0381d59a89cbf4013bdc5f'

const ITEMS = 4 // logo + tagline + buttons group + terms

function useStagger(count: number) {
  const anims = useRef(
    Array.from({ length: count }, () => ({
      opacity: new Animated.Value(0),
      ty: new Animated.Value(24),
    }))
  ).current

  useEffect(() => {
    Animated.parallel(
      anims.map((a, i) =>
        Animated.parallel([
          Animated.timing(a.opacity, { toValue: 1, duration: 480, delay: i * 100, useNativeDriver: true }),
          Animated.timing(a.ty, { toValue: 0, duration: 480, delay: i * 100, useNativeDriver: true }),
        ])
      )
    ).start()
  }, [])

  return anims.map((a) => ({ opacity: a.opacity, transform: [{ translateY: a.ty }] }))
}

export default function LoginScreen() {
  const { signInWithKakao, signInWithGoogle, signInWithApple } = useAuthStore()
  const insets = useSafeAreaInsets()
  const stagger = useStagger(ITEMS)

  const handleLogin = (fn: () => Promise<void>) => () => {
    fn().catch((e) => Alert.alert('로그인 실패', e?.message ?? String(e)))
  }

  const handleSkip = () => {
    useAuthStore.setState({
      session: {
        access_token: 'test',
        refresh_token: 'test',
        user: { id: 'test-user', email: 'test@test.com', name: '테스트', avatar_url: undefined, created_at: new Date().toISOString() },
      },
    })
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]}>

      {/* Logo */}
      <Animated.View style={[styles.hero, stagger[0]]}>
        <SvgXml xml={APPLE_1} width={110} height={144} />
      </Animated.View>

      {/* Tagline */}
      <Animated.View style={[styles.taglineWrap, stagger[1]]}>
        <Text style={styles.tagline}>나만의 AI 퍼스널 바디빌딩 코치</Text>
      </Animated.View>

      {/* Buttons */}
      <Animated.View style={[styles.buttons, stagger[2]]}>

        {/* Apple */}
        <TouchableOpacity style={styles.appleBtn} onPress={handleLogin(signInWithApple)} activeOpacity={0.85}>
          <Text style={styles.appleLogo}></Text>
          <Text style={styles.appleBtnText}>Apple로 계속하기</Text>
          <View style={styles.btnSpacer} />
        </TouchableOpacity>

        {/* Google */}
        <TouchableOpacity style={styles.googleBtn} onPress={handleLogin(signInWithGoogle)} activeOpacity={0.85}>
          <Text style={styles.googleG}>G</Text>
          <Text style={styles.googleBtnText}>Google로 계속하기</Text>
          <View style={styles.btnSpacer} />
        </TouchableOpacity>

        {/* Kakao */}
        <TouchableOpacity style={styles.kakaoBtn} onPress={handleLogin(signInWithKakao)} activeOpacity={0.85}>
          <Text style={styles.kakaoIcon}>💬</Text>
          <Text style={styles.kakaoBtnText}>카카오로 계속하기</Text>
          <View style={styles.btnSpacer} />
        </TouchableOpacity>

        {/* DEV: skip login */}
        <TouchableOpacity style={styles.skipBtn} onPress={handleSkip} activeOpacity={0.7}>
          <Text style={styles.skipText}>로그인 없이 시작 (테스트)</Text>
        </TouchableOpacity>

      </Animated.View>

      {/* Terms */}
      <Animated.View style={[styles.termsWrap, stagger[3]]}>
        <Text style={styles.terms}>
          {'계속 진행하면 '}
          <Text style={styles.termsLink} onPress={() => WebBrowser.openBrowserAsync(TERMS_URL)}>
            서비스 이용약관
          </Text>
          {' 및 '}
          <Text style={styles.termsLink} onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL)}>
            개인정보 처리방침
          </Text>
          {'\n에 동의하는 것으로 간주됩니다.'}
        </Text>
      </Animated.View>

    </View>
  )
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#0A0A0A',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 16,
  },
  taglineWrap: {
    marginBottom: 48,
  },
  tagline: {
    fontSize: 15,
    color: '#888',
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  buttons: {
    width: '100%',
    gap: 12,
  },
  // shared button base
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  appleLogo: {
    fontSize: 18,
    color: '#fff',
    lineHeight: 22,
    width: 28,
  },
  appleBtnText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: -0.3,
  },
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderWidth: 1.5,
    borderColor: '#e5e5e5',
  },
  googleG: {
    fontSize: 17,
    fontWeight: '700',
    color: '#4285F4',
    width: 28,
  },
  googleBtnText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#1a1a1a',
    letterSpacing: -0.3,
  },
  kakaoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEE500',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  kakaoIcon: {
    fontSize: 18,
    width: 28,
  },
  kakaoBtnText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    color: '#3C1E1E',
    letterSpacing: -0.3,
  },
  btnSpacer: {
    width: 28,
  },
  termsWrap: {
    marginTop: 24,
    paddingHorizontal: 8,
  },
  terms: {
    fontSize: 11,
    color: '#bbb',
    textAlign: 'center',
    lineHeight: 16,
  },
  termsLink: {
    color: '#999',
    textDecorationLine: 'underline',
  },
  skipBtn: {
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    marginTop: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#9147FF',
  },
  skipText: {
    fontSize: 13,
    color: '#9147FF',
    fontWeight: '600',
  },
})
