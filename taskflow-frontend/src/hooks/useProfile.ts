import { useMutation, useQueryClient } from '@tanstack/react-query'
import { userApi } from '../api/client'
import type { UserProfileUpdate } from '../types'

export function useUpdateProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: UserProfileUpdate) => userApi.updateProfile(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useUploadAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (file: File) => userApi.uploadAvatar(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}

export function useDeleteAvatar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => userApi.deleteAvatar(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] })
    },
  })
}
