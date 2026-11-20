import { create } from 'zustand'

export interface AuthUser {
  githubId: number
  login: string
  name: string
  avatarUrl: string
  isAdmin: boolean
  hasApiKey: boolean
}

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

export const useAuth = create<{ state: AuthState; user: AuthUser | null }>(() => ({
  state: 'loading',
  user: null,
}))

export const checkSession = async (): Promise<void> => {
  try {
    const response = await fetch('/api/auth/session')
    if (response.ok) {
      const user = (await response.json()) as AuthUser
      useAuth.setState({ state: 'authenticated', user })
    } else {
      useAuth.setState({ state: 'unauthenticated', user: null })
    }
  } catch {
    useAuth.setState({ state: 'unauthenticated', user: null })
  }
}

export const logout = async (): Promise<void> => {
  await fetch('/api/auth/logout', { method: 'POST' })
  useAuth.setState({ state: 'unauthenticated', user: null })
}

export const setApiKey = async (apiKey: string): Promise<void> => {
  const response = await fetch('/api/auth/api-key', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey }),
  })
  if (!response.ok) {
    throw new Error(`Failed to set api key: ${response.status}`)
  }
  useAuth.setState((state) => ({
    user: state.user ? { ...state.user, hasApiKey: true } : null,
  }))
}

export const clearApiKey = async (): Promise<void> => {
  const response = await fetch('/api/auth/api-key', { method: 'DELETE' })
  if (!response.ok) {
    throw new Error(`Failed to clear api key: ${response.status}`)
  }
  useAuth.setState((state) => ({
    user: state.user ? { ...state.user, hasApiKey: false } : null,
  }))
}

/** 从 URL 读取 OAuth 回跳错误码并清除，避免刷新后重复提示。 */
export const consumeLoginError = (): 'denied' | 'github' | null => {
  const params = new URLSearchParams(location.search)
  const value = params.get('login_error')
  if (value === 'denied' || value === 'github') {
    history.replaceState(null, '', location.pathname)
    return value
  }
  return null
}
