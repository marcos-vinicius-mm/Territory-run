import { useCallback, useRef, useState } from 'react'
import type { TrackPoint } from '../types'

interface UseGeolocationReturn {
  isTracking: boolean
  path: TrackPoint[]
  error: string | null
  start: () => Promise<void>
  stop: () => void
  reset: () => void
}

/**
 * Rastreia a posição do usuário enquanto corre.
 *
 * Limitação importante: navegadores mobile pausam/limitam o GPS quando a aba
 * não está em foco. Por isso seguramos um WakeLock pra manter a tela ligada
 * durante o rastreamento — é a única forma confiável de garantir GPS contínuo
 * num app web (PWA). Rastreamento 100% em segundo plano exigiria um wrapper
 * nativo (Capacitor) mais pra frente.
 */
export function useGeolocation(): UseGeolocationReturn {
  const [isTracking, setIsTracking] = useState(false)
  const [path, setPath] = useState<TrackPoint[]>([])
  const [error, setError] = useState<string | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const wakeLockRef = useRef<WakeLockSentinel | null>(null)

  const requestWakeLock = useCallback(async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await navigator.wakeLock.request('screen')
      }
    } catch {
      // Falha silenciosa: wake lock é uma melhoria, não um requisito bloqueante
    }
  }, [])

  const releaseWakeLock = useCallback(() => {
    wakeLockRef.current?.release().catch(() => {})
    wakeLockRef.current = null
  }, [])

  const start = useCallback(async () => {
    if (!('geolocation' in navigator)) {
      setError('Geolocalização não é suportada neste navegador.')
      return
    }

    setError(null)
    await requestWakeLock()

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const point: TrackPoint = {
          coords: [position.coords.longitude, position.coords.latitude],
          timestamp: position.timestamp,
          accuracy: position.coords.accuracy,
        }
        setPath((prev) => [...prev, point])
      },
      (err) => {
        setError(err.message)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    )

    setIsTracking(true)
  }, [requestWakeLock])

  const stop = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    releaseWakeLock()
    setIsTracking(false)
  }, [releaseWakeLock])

  const reset = useCallback(() => {
    setPath([])
    setError(null)
  }, [])

  return { isTracking, path, error, start, stop, reset }
}
