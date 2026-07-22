import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { authApi } from '../api/client'

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: authApi.me,
    enabled: !!localStorage.getItem('access_token'),
    retry: false,
  })
}

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: authApi.login,
    onSuccess: (data) => {
      localStorage.setItem('access_token', data.access_token)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useRegister() {
  return useMutation({ mutationFn: authApi.register })
}

export function useVerifyEmail() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: authApi.verifyEmail,
    onSuccess: (data) => {
      localStorage.setItem('access_token', data.access_token)
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useResendVerification() {
  return useMutation({ mutationFn: authApi.resendVerification })
}

export function useLogout() {
  const qc = useQueryClient()
  return async () => {
    try {
      await authApi.logout()
    } catch {
      // backend may already be unreachable — still clear local state
    }
    localStorage.removeItem('access_token')
    qc.clear()
    window.location.href = '/login'
  }
}
