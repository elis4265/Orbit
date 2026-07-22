import { describe, it, expect } from 'vitest'
import { applyTemplate, type TemplateFormFields } from '../../src/lib/taskTemplate'
import type { TaskTemplate } from '../../src/types'

const BLANK: TemplateFormFields = {
  title: '', description: '', issueType: 'task', severity: '', priorityId: null, tagIds: [],
}

function tpl(over: Partial<TaskTemplate>): TaskTemplate {
  return {
    id: 't', project_id: 'p', name: 'T', title: null, description: null,
    issue_type: null, priority_id: null, severity: null, tag_ids: [], position: 0, ...over,
  } as TaskTemplate
}

describe('applyTemplate', () => {
  it('fills set fields from the template', () => {
    const out = applyTemplate(BLANK, tpl({ title: '[BUG] ', description: '## Steps', issue_type: 'bug', severity: 'high', priority_id: 'pr-1', tag_ids: ['tag-1'] }))
    expect(out).toEqual({ title: '[BUG] ', description: '## Steps', issueType: 'bug', severity: 'high', priorityId: 'pr-1', tagIds: ['tag-1'] })
  })

  it('keeps the user’s typed title when the template has none', () => {
    const current = { ...BLANK, title: 'my own title' }
    const out = applyTemplate(current, tpl({ issue_type: 'bug' }))
    expect(out.title).toBe('my own title')   // not wiped
    expect(out.issueType).toBe('bug')        // template still applies what it sets
  })

  it('a blank template leaves everything as-is', () => {
    const current: TemplateFormFields = { title: 'x', description: 'y', issueType: 'story', severity: 'low', priorityId: 'p1', tagIds: ['t1'] }
    expect(applyTemplate(current, tpl({}))).toEqual(current)
  })

  it('treats empty-string template fields as unset', () => {
    const current = { ...BLANK, title: 'keep', description: 'keepdesc' }
    const out = applyTemplate(current, tpl({ title: '   ', description: '' }))
    expect(out.title).toBe('keep')
    expect(out.description).toBe('keepdesc')
  })
})
