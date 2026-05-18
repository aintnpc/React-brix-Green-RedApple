import { useEffect, useRef } from 'react'
import { Animated, StyleSheet, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNetworkStatus } from '../hooks/useNetworkStatus'

export function OfflineBanner() {
  const isConnected = useNetworkStatus()
  const translateY = useRef(new Animated.Value(-60)).current
  const insets = useSafeAreaInsets()

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: isConnected ? -60 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start()
  }, [isConnected])

  return (
    <Animated.View
      style={[s.banner, { paddingTop: insets.top + 8, transform: [{ translateY }] }]}
      pointerEvents="none"
    >
      <Text style={s.text}>인터넷 연결이 끊겼어요. 연결 후 다시 시도해주세요.</Text>
    </Animated.View>
  )
}

const s = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 16,
    paddingBottom: 10,
    alignItems: 'center',
  },
  text: {
    color: '#f5c542',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
})
