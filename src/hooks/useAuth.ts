import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface UseAuthReturn {
  session: Session | null
  loading: boolean
  error: string | null
  signUp: (email: string, password: string, username: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signUp = async (email: string, password: string, username: string) => {
    setError(null)
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username } },
    })
    if (signUpError) setError(signUpError.message)
  }

  const signIn = async (email: string, password: string) => {
    setError(null)
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    if (signInError) setError(signInError.message)
  }

  const signOut = async () => {
    setError(null)
    await supabase.auth.signOut()
  }

  return { session, loading, error, signUp, signIn, signOut }
}
