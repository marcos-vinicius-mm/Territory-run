import { useEffect, useMemo, useState } from 'react'
import { GameMap } from './components/GameMap'
import { AuthScreen } from './components/AuthScreen'
import { useGeolocation } from './hooks/useGeolocation'
import { useAuth } from './hooks/useAuth'
import { useGameStore } from './store/useGameStore'
import { hasClosedLoop } from './lib/territoryUtils'
import { supabase } from './lib/supabase'
import { fetchTerritories, subscribeToTerritories, claimTerritory } from './lib/territoryService'
import './App.css'

function App() {
  const { session, signOut } = useAuth()
  const { isTracking, path, error, start, stop, reset } = useGeolocation()
  const territories = useGameStore((s) => s.territories)
  const setTerritories = useGameStore((s) => s.setTerritories)
  const currentUser = useGameStore((s) => s.currentUser)
  const setCurrentUser = useGameStore((s) => s.setCurrentUser)

  const [claimStatus, setClaimStatus] = useState<'idle' | 'claiming' | 'error'>('idle')
  const [claimError, setClaimError] = useState<string | null>(null)

  const currentPathCoords = useMemo(() => path.map((p) => p.coords), [path])
  const loopClosed = useMemo(() => hasClosedLoop(path), [path])

  // Busca o perfil (criado automaticamente pelo trigger no cadastro) assim que loga
  useEffect(() => {
    if (!session?.user) {
      setCurrentUser(null)
      return
    }
    supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single()
      .then(({ data }) => {
        if (data) setCurrentUser(data)
      })
  }, [session, setCurrentUser])

  // Busca territórios existentes e assina updates em tempo real (de qualquer jogador)
  useEffect(() => {
    if (!session) return

    let cancelled = false
    const refresh = () => {
      fetchTerritories()
        .then((data) => {
          if (!cancelled) setTerritories(data)
        })
        .catch((err) => console.error('Erro ao buscar territórios', err))
    }

    refresh()
    const unsubscribe = subscribeToTerritories(refresh)

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [session, setTerritories])

  const handleToggleTracking = async () => {
    if (isTracking) {
      stop()
      if (loopClosed && path.length > 0) {
        setClaimStatus('claiming')
        setClaimError(null)
        try {
          const startedAt = new Date(path[0].timestamp).toISOString()
          await claimTerritory(currentPathCoords, startedAt)
          // O realtime já vai trazer o território atualizado, mas buscamos
          // na hora também pra feedback imediato pra quem acabou de correr.
          setTerritories(await fetchTerritories())
          setClaimStatus('idle')
          reset()
        } catch (err) {
          setClaimStatus('error')
          setClaimError(err instanceof Error ? err.message : 'Erro ao conquistar território')
        }
      }
    } else {
      reset()
      setClaimStatus('idle')
      setClaimError(null)
      await start()
    }
  }

  if (!session) {
    return <AuthScreen />
  }

  return (
    <div className="app-shell">
      <div className="map-container">
        <GameMap currentPath={currentPathCoords} territories={territories} />
      </div>

      <div className="hud">
        {error && <p className="hud-error">{error}</p>}
        {claimError && <p className="hud-error">Não foi possível conquistar: {claimError}</p>}
        <p className="hud-status">
          {currentUser ? `Olá, ${currentUser.username}` : 'Carregando perfil...'}
        </p>
        <p className="hud-status">
          {claimStatus === 'claiming'
            ? 'Registrando conquista...'
            : isTracking
              ? `Rastreando... ${path.length} pontos`
              : 'Parado'}
          {loopClosed && claimStatus === 'idle' && ' — Loop fechado! 🎯'}
        </p>
        <button
          className="hud-button"
          onClick={handleToggleTracking}
          disabled={claimStatus === 'claiming'}
        >
          {isTracking ? 'Parar corrida' : 'Iniciar corrida'}
        </button>
        <button className="hud-signout" onClick={signOut}>
          Sair
        </button>
      </div>
    </div>
  )
}

export default App
