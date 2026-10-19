import { DateTime } from 'luxon'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import Committee from '#models/committee'
import CommitteeMember from '#models/committee_member'
import OrganizationMember from '#models/organization_member'
import type { MemberAssignments } from '#validators/committee_member'

export default class CommitteeMemberService {
  list(committee: Committee) {
    return committee
      .related('members')
      .query()
      .orderBy('slot_number')
      .preload('member', (member) => member.preload('user'))
  }

  async update(committee: Committee, assignments: MemberAssignments) {
    await db.transaction(async (trx) => {
      const current = await Committee.query({ client: trx })
        .where('id', committee.id)
        .where('organization_id', committee.organizationId)
        .forUpdate()
        .firstOrFail()
      if (current.status !== 'draft')
        throw new Exception('Only draft member assignments can be edited', { status: 409 })
      const numbers = assignments.map((member) => member.slotNumber)
      if (
        numbers.length !== current.slotCount ||
        new Set(numbers).size !== current.slotCount ||
        numbers.some((number) => number > current.slotCount)
      ) {
        throw new Exception('Provide every slot number once', { status: 422 })
      }
      const memberIds = [
        ...new Set(
          assignments.flatMap((member) =>
            member.organizationMemberId ? [member.organizationMemberId] : []
          )
        ),
      ]
      if (memberIds.length) {
        const members = await OrganizationMember.query({ client: trx })
          .where('organization_id', current.organizationId)
          .whereIn('id', memberIds)
        if (members.length !== memberIds.length)
          throw new Exception('All assigned members must belong to this organization', {
            status: 422,
          })
      }
      for (const assignment of assignments) {
        await CommitteeMember.query({ client: trx })
          .where('committee_id', current.id)
          .where('slot_number', assignment.slotNumber)
          .update({
            organizationMemberId: assignment.organizationMemberId,
            updatedAt: DateTime.utc(),
          })
      }
    })
    return this.list(committee)
  }
}
