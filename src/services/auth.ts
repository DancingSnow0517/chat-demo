import { create } from 'zustand'

type AuthState = 'loading' | 'authenticated' | 'unauthenticated'

export const useAuth = create<{ state: AuthState }>(() => ({ state: 'loading' }))

export const checkSession = async (): Promise<void> => {
  try {
    const response = await fetch('/api/auth/session')
    useAuth.setState({ state: response.ok ? 'authenticated' : 'unauthenticated' })
  } catch {
    useAuth.setState({ state: 'unauthenticated' })
  }
}

export const logout = async (): Promise<void> => {
  await fetch('/api/auth/logout', { method: 'POST' })
  useAuth.setState({ state: 'unauthenticated' })
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
