import { useEffect, useState } from 'react'
import * as Network from 'expo-network'

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      const state = await Network.getNetworkStateAsync()
      if (!cancelled) setIsConnected(state.isConnected ?? true)
    }

    check()
    const interval = setInterval(check, 5000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  return isConnected
}
