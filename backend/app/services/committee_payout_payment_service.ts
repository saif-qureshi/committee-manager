import { randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import { formatAmount, toMinorUnits } from '#helpers/money'
import Committee from '#models/committee'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'
import CommitteePayoutPayment from '#models/committee_payout_payment'
import type { PayoutPaymentInput } from '#validators/committee_payout_payment'

export default class CommitteePayoutPaymentService {
  list(payout: CommitteePayout, page = 1) {
    return CommitteePayoutPayment.query()
      .where('organization_id', payout.organizationId)
      .where('payout_id', payout.id)
      .orderBy('paid_on', 'desc')
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .paginate(page, 25)
  }

  async create(
    committee: Committee,
    payout: CommitteePayout,
    input: PayoutPaymentInput,
    userId: number
  ) {
    try {
      return await db.transaction(async (trx) => {
        const current = await Committee.query({ client: trx })
          .where('id', committee.id)
          .where('organization_id', committee.organizationId)
          .forUpdate()
          .firstOrFail()
        const currentPayout = await CommitteePayout.query({ client: trx })
          .where('id', payout.id)
          .where('committee_id', current.id)
          .where('organization_id', current.organizationId)
          .forUpdate()
          .firstOrFail()
        const existing = await CommitteePayoutPayment.query({ client: trx })
          .where('organization_id', current.organizationId)
          .where('request_id', input.requestId)
          .first()
        if (existing) return this.retry(existing, currentPayout, input)
        if (
          current.status !== 'active' ||
          !['selected', 'partially_paid'].includes(currentPayout.status)
        ) {
          throw new Exception(
            'Payout recording requires an active committee and an unpaid selected recipient',
            { status: 409 }
          )
        }
        const recipient = await CommitteeMember.query({ client: trx })
          .where('id', currentPayout.committeeMemberId!)
          .where('organization_id', current.organizationId)
          .where('committee_id', current.id)
          .firstOrFail()
        if (!recipient.organizationMemberId)
          throw new Exception('The recipient slot has no member', { status: 409 })
        const totals = await trx
          .from('committee_payout_payments')
          .where('payout_id', currentPayout.id)
          .sum('amount as total')
          .first()
        const previous = toMinorUnits(totals?.total ?? '0.00')
        if (previous !== toMinorUnits(currentPayout.paidAmount)) {
          throw new Exception('Payout totals require reconciliation before another handover', {
            status: 409,
          })
        }
        const amount = toMinorUnits(input.amount)
        const total = previous + amount
        const expected = toMinorUnits(currentPayout.expectedAmount)
        if (total > expected)
          throw new Exception('Payment exceeds the remaining payout amount', { status: 409 })
        // shortcut: verify available cash when contribution and funding records are implemented.
        const payment = await CommitteePayoutPayment.create(
          {
            id: randomUUID(),
            organizationId: current.organizationId,
            committeeId: current.id,
            payoutId: currentPayout.id,
            organizationMemberId: recipient.organizationMemberId,
            amount: formatAmount(amount),
            paidOn: DateTime.fromISO(input.paidOn, { zone: 'UTC' }),
            paymentMethod: input.paymentMethod,
            reference: input.reference || null,
            recordedBy: userId,
            requestId: input.requestId,
          },
          { client: trx }
        )
        currentPayout.merge({
          paidAmount: formatAmount(total),
          status: total === expected ? 'paid' : 'partially_paid',
          paidAt: total === expected ? DateTime.utc() : null,
        })
        await currentPayout.save()
        return { payment, created: true }
      })
    } catch (error) {
      const failure = error as { code?: string; constraint?: string } | null
      if (failure?.code === '23505' && failure.constraint === 'payout_payments_request_unique') {
        const existing = await CommitteePayoutPayment.query()
          .where('organization_id', committee.organizationId)
          .where('request_id', input.requestId)
          .firstOrFail()
        return this.retry(existing, payout, input)
      }
      throw error
    }
  }

  private retry(
    payment: CommitteePayoutPayment,
    payout: CommitteePayout,
    input: PayoutPaymentInput
  ) {
    if (
      payment.payoutId !== payout.id ||
      payment.committeeId !== payout.committeeId ||
      payment.amount !== formatAmount(toMinorUnits(input.amount)) ||
      payment.paidOn.toISODate() !== input.paidOn ||
      payment.paymentMethod !== input.paymentMethod ||
      payment.reference !== (input.reference || null)
    ) {
      throw new Exception('Request ID was already used for a different payout payment', {
        status: 409,
      })
    }
    return { payment, created: false }
  }
}
