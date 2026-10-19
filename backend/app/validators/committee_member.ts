import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { committeeParams } from '#validators/committee'

export const updateCommitteeMembersValidator = vine.create({
  params: committeeParams(),
  members: vine
    .array(
      vine.object({
        slotNumber: vine.number().withoutDecimals().min(1).max(100),
        organizationMemberId: vine.string().uuid().nullable(),
      })
    )
    .minLength(1)
    .maxLength(100),
})
export type MemberAssignments = Infer<typeof updateCommitteeMembersValidator>['members']
