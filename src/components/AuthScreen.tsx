import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import './AuthScreen.css'

export function AuthScreen() {
  const { signUp, signIn, error, loading } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    if (mode === 'signup') {
      await signUp(email, password, username)
    } else {
      await signIn(email, password)
    }
    setSubmitting(false)
  }

  if (loading) return null

  return (
    <div className="auth-screen">
      <form className="auth-card" onSubmit={handleSubmit}>
        <h1>Territory Run</h1>
        <p className="auth-subtitle">
          {mode === 'signin' ? 'Entre pra continuar conquistando' : 'Crie sua conta e comece a correr'}
        </p>

        {mode === 'signup' && (
          <input
            type="text"
            placeholder="Nome de usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            minLength={3}
          />
        )}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
        />

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Aguarde...' : mode === 'signin' ? 'Entrar' : 'Cadastrar'}
        </button>

        <button
          type="button"
          className="auth-toggle"
          onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
        >
          {mode === 'signin' ? 'Não tem conta? Cadastre-se' : 'Já tem conta? Entrar'}
        </button>
      </form>
    </div>
  )
}
