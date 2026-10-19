import { DateTime } from 'luxon'
import { formatAmount, toMinorUnits } from '#helpers/money'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import Committee from '#models/committee'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'

export default class CommitteeScheduleService {
  rows(committee: Committee) {
    const expectedAmount = formatAmount(
      toMinorUnits(committee.contributionAmount) * BigInt(committee.slotCount)
    )
    return Array.from({ length: committee.slotCount }, (_, index) => ({
      roundNumber: index + 1,
      // Always calculate from the original anchor, including after February.
      dueDate: committee.firstDueDate.plus(
        committee.frequency === 'monthly' ? { months: index } : { weeks: index }
      ),
      expectedAmount,
    }))
  }

  preview(committee: Committee) {
    return db.transaction(async (trx) => {
      const { schedule } = await this.load(committee, trx)
      return schedule
    })
  }

  activate(committee: Committee) {
    return db.transaction(async (trx) => {
      const { current, schedule } = await this.load(committee, trx)
      if (current.status === 'active') return { committee: current, created: false }
      if (!schedule.readyToActivate) {
        throw new Exception(schedule.issues.join('; '), { status: 409 })
      }
      const now = DateTime.utc()
      if (current.selectionType === 'fixed') {
        await CommitteePayout.query({ client: trx })
          .where('committee_id', current.id)
          .update({ status: 'selected', selectedAt: now, updatedAt: now })
      }
      current.merge({ status: 'active', activatedAt: now })
      await current.save()
      return { committee: current, created: true }
    })
  }

  private async load(committee: Committee, trx: TransactionClientContract) {
    const current = await Committee.query({ client: trx })
      .where('id', committee.id)
      .where('organization_id', committee.organizationId)
      .forUpdate()
      .withCount('members', (query) =>
        query.whereNotNull('organization_member_id').as('assigned_member_count')
      )
      .firstOrFail()
    const members = await CommitteeMember.query({ client: trx }).where('committee_id', current.id)
    const payouts = await CommitteePayout.query({ client: trx })
      .where('committee_id', current.id)
      .orderBy('round_number')
    const issues: string[] = []
    if (
      members.length !== current.slotCount ||
      members.some((member) => !member.organizationMemberId)
    ) {
      issues.push('Assign an organization member to every slot')
    }
    if (
      payouts.length !== current.slotCount ||
      (current.selectionType === 'fixed' && payouts.some((payout) => !payout.committeeMemberId))
    ) {
      issues.push('Assign a unique recipient slot to every fixed payout turn')
    }
    if (current.selectionType === 'draw' && current.overdueDrawAllowed === null) {
      issues.push('Choose whether overdue slots are eligible for lucky draws')
    }
    return {
      current,
      schedule: {
        committeeId: current.id,
        status: current.status,
        readyToActivate: current.status === 'draft' && issues.length === 0,
        issues,
        contributionAmount: current.contributionAmount,
        slotCount: current.slotCount,
        totalContributionPerSlot: this.rows(current)[0].expectedAmount,
        payouts: payouts.map((payout) => ({
          id: payout.id,
          roundNumber: payout.roundNumber,
          dueDate: payout.dueDate.toISODate(),
          committeeMemberId: payout.committeeMemberId,
          organizationMemberId:
            members.find((member) => member.id === payout.committeeMemberId)
              ?.organizationMemberId ?? null,
          expectedAmount: payout.expectedAmount,
          paidAmount: payout.paidAmount,
          remainingAmount: formatAmount(
            toMinorUnits(payout.expectedAmount) - toMinorUnits(payout.paidAmount)
          ),
          paidAt: payout.paidAt,
          status: payout.status,
          selectedAt: payout.selectedAt,
        })),
      },
    }
  }
}
