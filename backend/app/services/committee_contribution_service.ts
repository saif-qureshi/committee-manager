import { createHash, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import { formatAmount, toMinorUnits } from '#helpers/money'
import Committee from '#models/committee'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'
import CommitteeContribution from '#models/committee_contribution'
import type { ContributionFilters, ContributionInput } from '#validators/committee_contribution'

export default class CommitteeContributionService {
  list(committee: Committee, filters: ContributionFilters) {
    const query = CommitteeContribution.query()
      .where('organization_id', committee.organizationId)
      .where('committee_id', committee.id)
    if (filters.committeeMemberId) query.where('committee_member_id', filters.committeeMemberId)
    if (filters.payoutId) query.where('payout_id', filters.payoutId)
    return query
      .orderBy('paid_on', 'desc')
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .paginate(filters.page ?? 1, 25)
  }

  async create(committee: Committee, input: ContributionInput, userId: number) {
    const requestHash = createHash('sha256')
      .update(
        JSON.stringify({
          committeeId: committee.id,
          committeeMemberId: input.committeeMemberId,
          payoutId: input.payoutId,
          amount: input.amount === undefined ? null : formatAmount(toMinorUnits(input.amount)),
          paidOn: input.paidOn,
          paymentMethod: input.paymentMethod,
          reference: input.reference || null,
        })
      )
      .digest('hex')
    try {
      return await db.transaction(async (trx) => {
        const current = await Committee.query({ client: trx })
          .where('id', committee.id)
          .where('organization_id', committee.organizationId)
          .forUpdate()
          .firstOrFail()
        const existing = await CommitteeContribution.query({ client: trx })
          .where('organization_id', current.organizationId)
          .where('request_id', input.requestId)
          .first()
        if (existing) return this.retry(existing, requestHash)
        if (current.status !== 'active')
          throw new Exception('Contributions require an active committee', { status: 409 })
        const member = await CommitteeMember.query({ client: trx })
          .where('id', input.committeeMemberId)
          .where('committee_id', current.id)
          .where('organization_id', current.organizationId)
          .firstOrFail()
        await CommitteePayout.query({ client: trx })
          .where('id', input.payoutId)
          .where('committee_id', current.id)
          .where('organization_id', current.organizationId)
          .firstOrFail()
        if (!member.organizationMemberId)
          throw new Exception('The slot has no assigned member', { status: 409 })
        const totals = await trx
          .from('committee_contributions')
          .where('committee_id', current.id)
          .where('committee_member_id', member.id)
          .where('payout_id', input.payoutId)
          .sum('amount as total')
          .first()
        const remaining =
          toMinorUnits(current.contributionAmount) - toMinorUnits(totals?.total ?? '0.00')
        const amount = input.amount === undefined ? remaining : toMinorUnits(input.amount)
        if (remaining <= 0n || amount > remaining)
          throw new Exception(
            'This slot and round are already paid or the amount exceeds the balance',
            { status: 409 }
          )
        const contribution = await CommitteeContribution.create(
          {
            id: randomUUID(),
            organizationId: current.organizationId,
            committeeId: current.id,
            committeeMemberId: member.id,
            organizationMemberId: member.organizationMemberId,
            payoutId: input.payoutId,
            amount: formatAmount(amount),
            paidOn: DateTime.fromISO(input.paidOn, { zone: 'UTC' }),
            paymentMethod: input.paymentMethod,
            reference: input.reference || null,
            recordedBy: userId,
            requestId: input.requestId,
            requestHash,
          },
          { client: trx }
        )
        return { contribution, created: true }
      })
    } catch (error) {
      const failure = error as { code?: string; constraint?: string } | null
      if (failure?.code === '23505' && failure.constraint === 'contributions_request_unique') {
        const existing = await CommitteeContribution.query()
          .where('organization_id', committee.organizationId)
          .where('request_id', input.requestId)
          .firstOrFail()
        return this.retry(existing, requestHash)
      }
      throw error
    }
  }

  private retry(contribution: CommitteeContribution, requestHash: string) {
    if (contribution.requestHash !== requestHash)
      throw new Exception('Request ID was already used for a different contribution', {
        status: 409,
      })
    return { contribution, created: false }
  }
}
