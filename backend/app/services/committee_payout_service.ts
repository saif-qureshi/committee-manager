import { DateTime } from 'luxon'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import Committee from '#models/committee'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'
import type { PayoutAssignments } from '#validators/committee_payout'

export default class CommitteePayoutService {
  list(committee: Committee) {
    return committee.related('payouts').query().orderBy('round_number')
  }

  async update(committee: Committee, assignments: PayoutAssignments) {
    await db.transaction(async (trx) => {
      const current = await Committee.query({ client: trx })
        .where('id', committee.id)
        .where('organization_id', committee.organizationId)
        .forUpdate()
        .firstOrFail()
      if (current.status !== 'draft')
        throw new Exception('Only draft payout turns can be edited', { status: 409 })
      const rounds = assignments.map((payout) => payout.roundNumber)
      const recipients = assignments.flatMap((payout) =>
        payout.committeeMemberId ? [payout.committeeMemberId] : []
      )
      if (
        rounds.length !== current.slotCount ||
        new Set(rounds).size !== current.slotCount ||
        rounds.some((round) => round > current.slotCount) ||
        new Set(recipients).size !== recipients.length ||
        (current.selectionType === 'draw' && recipients.length > 0)
      ) {
        throw new Exception(
          'Provide every round once with unique fixed recipients or null draw recipients',
          { status: 422 }
        )
      }
      if (recipients.length) {
        const members = await CommitteeMember.query({ client: trx })
          .where('committee_id', current.id)
          .whereIn('id', recipients)
        if (members.length !== recipients.length)
          throw new Exception('Recipient slots must belong to this committee', { status: 422 })
      }
      // Clear recipients first so swapping two unique turns is safe.
      await CommitteePayout.query({ client: trx })
        .where('committee_id', current.id)
        .update({ committeeMemberId: null })
      for (const assignment of assignments) {
        await CommitteePayout.query({ client: trx })
          .where('committee_id', current.id)
          .where('round_number', assignment.roundNumber)
          .update({ committeeMemberId: assignment.committeeMemberId, updatedAt: DateTime.utc() })
      }
    })
    return this.list(committee)
  }
}
