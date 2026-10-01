import type { Role } from './types'

export const canEdit = (role: Role) =>
  ['owner', 'admin', 'editor'].includes(role)
export const canManage = (role: Role) => ['owner', 'admin'].includes(role)
export const canDeleteWorkspace = (role: Role) => role === 'owner'
export const canManageMember = (actor: Role, target: Role, nextRole?: Role) =>
  canManage(actor) &&
  target !== 'owner' &&
  nextRole !== 'owner' &&
  (actor === 'owner' || (target !== 'admin' && nextRole !== 'admin'))
