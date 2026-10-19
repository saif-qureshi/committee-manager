import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import Committee from '#models/committee'
import type { DueFilters } from '#validators/committee_contribution'

export type CommitteeDue = {
  committeeMemberId: string
  slotNumber: number
  organizationMemberId: string
  fullName: string | null
  username: string | null
  phone: string | null
  payoutId: string
  roundNumber: number
  dueDate: string
  expectedAmount: string
  paidAmount: string
  remainingAmount: string
  status: 'pending' | 'overdue' | 'paid'
  isPartiallyPaid: boolean
  daysOverdue: number
}

export default class CommitteeDueService {
  list(committee: Committee, filters: DueFilters) {
    return db.transaction(async (trx) => {
      const current = await Committee.query({ client: trx })
        .where('id', committee.id)
        .where('organization_id', committee.organizationId)
        .forUpdate()
        .firstOrFail()
      if (current.status !== 'active')
        throw new Exception('Contribution dues require an active committee', { status: 409 })
      const receipts = trx
        .from('committee_contributions')
        .where('committee_id', current.id)
        .where('paid_on', '<=', filters.asOf)
        .select('committee_member_id', 'payout_id')
        .sum('amount as total')
        .groupBy('committee_member_id', 'payout_id')
      const query = trx
        .query<CommitteeDue>()
        .with('receipts', receipts)
        .from('committee_members as slots')
        .join('committee_payouts as rounds', 'rounds.committee_id', 'slots.committee_id')
        .join(
          'organization_members as memberships',
          'memberships.id',
          'slots.organization_member_id'
        )
        .join('users', 'users.id', 'memberships.user_id')
        .leftJoin('receipts', (join) =>
          join
            .on('receipts.committee_member_id', 'slots.id')
            .andOn('receipts.payout_id', 'rounds.id')
        )
        .where('slots.committee_id', current.id)
        .where('rounds.committee_id', current.id)
        .where('slots.organization_id', current.organizationId)
        .where('rounds.organization_id', current.organizationId)
        .select(
          'slots.id as committeeMemberId',
          'slots.slot_number as slotNumber',
          'slots.organization_member_id as organizationMemberId',
          'users.full_name as fullName',
          'users.username',
          'users.phone',
          'rounds.id as payoutId',
          'rounds.round_number as roundNumber'
        )
        .select(trx.raw('to_char(rounds.due_date, ?) as "dueDate"', ['YYYY-MM-DD']))
        .select(trx.raw('?::numeric(14,2) as "expectedAmount"', [current.contributionAmount]))
        .select(trx.raw('COALESCE(receipts.total, 0)::numeric(14,2) as "paidAmount"'))
        .select(
          trx.raw(
            '(?::numeric - COALESCE(receipts.total, 0))::numeric(14,2) as "remainingAmount"',
            [current.contributionAmount]
          )
        )
        .select(
          trx.raw(
            "CASE WHEN COALESCE(receipts.total, 0) = ?::numeric THEN 'paid' WHEN rounds.due_date < ?::date THEN 'overdue' ELSE 'pending' END as status",
            [current.contributionAmount, filters.asOf]
          )
        )
        .select(
          trx.raw(
            'COALESCE(receipts.total, 0) > 0 AND COALESCE(receipts.total, 0) < ?::numeric as "isPartiallyPaid"',
            [current.contributionAmount]
          )
        )
        .select(
          trx.raw(
            'CASE WHEN COALESCE(receipts.total, 0) < ?::numeric THEN GREATEST(0, ?::date - rounds.due_date) ELSE 0 END as "daysOverdue"',
            [current.contributionAmount, filters.asOf]
          )
        )
      if (filters.committeeMemberId) query.where('slots.id', filters.committeeMemberId)
      if (filters.status === 'paid')
        query.whereRaw('COALESCE(receipts.total, 0) = ?::numeric', [current.contributionAmount])
      if (filters.status === 'pending' || filters.status === 'overdue') {
        query
          .whereRaw('COALESCE(receipts.total, 0) < ?::numeric', [current.contributionAmount])
          .where('rounds.due_date', filters.status === 'overdue' ? '<' : '>=', filters.asOf)
      }
      return query
        .orderBy('rounds.due_date')
        .orderBy('slots.slot_number')
        .paginate(filters.page ?? 1, 25)
    })
  }
}
