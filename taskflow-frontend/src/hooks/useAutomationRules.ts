import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { automationRuleApi } from '../api/client'
import type { AutomationRule, AutomationRuleCreate } from '../types'

export function useAutomationRules(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['automation-rules', projectId],
    queryFn: () => automationRuleApi.list(projectId),
    enabled: !!projectId && enabled,
    staleTime: 60_000,
  })
}

export function useCreateAutomationRule(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: AutomationRuleCreate) => automationRuleApi.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules', projectId] }),
  })
}

export function useUpdateAutomationRule(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ ruleId, data }: { ruleId: string; data: Partial<AutomationRule> }) =>
      automationRuleApi.update(projectId, ruleId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules', projectId] }),
  })
}

export function useDeleteAutomationRule(projectId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ruleId: string) => automationRuleApi.delete(projectId, ruleId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automation-rules', projectId] }),
  })
}
