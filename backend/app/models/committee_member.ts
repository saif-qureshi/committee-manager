import { CommitteeMemberSchema } from '#database/schema'
import { belongsTo } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import OrganizationMember from '#models/organization_member'

export default class CommitteeMember extends CommitteeMemberSchema {
  @belongsTo(() => OrganizationMember, { foreignKey: 'organizationMemberId' })
  declare member: BelongsTo<typeof OrganizationMember>
}
