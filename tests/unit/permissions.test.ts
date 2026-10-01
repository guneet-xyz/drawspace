import { describe, expect, it } from 'vitest'
import {
  canDeleteWorkspace,
  canEdit,
  canManage,
  canManageMember,
} from '../../src/lib/permissions'
import type { Role } from '../../src/lib/types'

describe('workspace permissions', () => {
  it.each(['owner', 'admin', 'editor'] as Role[])(
    '%s can edit drawings',
    (role) => expect(canEdit(role)).toBe(true),
  )
  it('viewers cannot edit or manage', () => {
    expect(canEdit('viewer')).toBe(false)
    expect(canManage('viewer')).toBe(false)
    expect(canManage('editor')).toBe(false)
  })
  it('only the owner can delete a workspace', () => {
    expect(canDeleteWorkspace('owner')).toBe(true)
    for (const role of ['admin', 'editor', 'viewer'] as Role[])
      expect(canDeleteWorkspace(role)).toBe(false)
  })
  it('protects the owner from every actor', () => {
    for (const role of ['owner', 'admin', 'editor', 'viewer'] as Role[]) {
      expect(canManageMember(role, 'owner')).toBe(false)
      expect(canManageMember(role, 'editor', 'owner')).toBe(false)
    }
  })
  it('admins cannot manage or create other admins', () => {
    expect(canManageMember('admin', 'admin')).toBe(false)
    expect(canManageMember('admin', 'viewer', 'admin')).toBe(false)
    expect(canManageMember('admin', 'editor', 'viewer')).toBe(true)
    expect(canManageMember('owner', 'admin', 'editor')).toBe(true)
  })
})
