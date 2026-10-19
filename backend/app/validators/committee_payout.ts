import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { committeeParams } from '#validators/committee'

export const updateCommitteePayoutsValidator = vine.create({
  params: committeeParams(),
  payouts: vine
    .array(
      vine.object({
        roundNumber: vine.number().withoutDecimals().min(1).max(100),
        committeeMemberId: vine.string().uuid().nullable(),
      })
    )
    .minLength(1)
    .maxLength(100),
})
export type PayoutAssignments = Infer<typeof updateCommitteePayoutsValidator>['payouts']
