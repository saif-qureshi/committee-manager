import { CommitteeSchema } from '#database/schema'
import { hasMany } from '@adonisjs/lucid/orm'
import type { HasMany } from '@adonisjs/lucid/types/relations'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'

export default class Committee extends CommitteeSchema {
  @hasMany(() => CommitteeMember)
  declare members: HasMany<typeof CommitteeMember>

  @hasMany(() => CommitteePayout)
  declare payouts: HasMany<typeof CommitteePayout>
}
