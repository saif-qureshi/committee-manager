import { column } from '@adonisjs/lucid/orm'
import { CommitteeDrawSchema } from '#database/schema'

export type EligibleSlot = {
  committeeMemberId: string
  organizationMemberId: string
  slotNumber: number
}

export default class CommitteeDraw extends CommitteeDrawSchema {
  @column({ prepare: (value: EligibleSlot[]) => JSON.stringify(value) })
  declare eligibleSlots: EligibleSlot[]
}
