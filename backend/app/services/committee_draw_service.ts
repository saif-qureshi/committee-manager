import { randomInt, randomUUID } from 'node:crypto'
import { DateTime } from 'luxon'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import { toMinorUnits } from '#helpers/money'
import Committee from '#models/committee'
import CommitteePayout from '#models/committee_payout'
import CommitteeMember from '#models/committee_member'
import CommitteeDraw, { type EligibleSlot } from '#models/committee_draw'
import type { DrawInput } from '#validators/committee_draw'

export default class CommitteeDrawService {
  show(payout: CommitteePayout) {
    return CommitteeDraw.query()
      .where('organization_id', payout.organizationId)
      .where('committee_id', payout.committeeId)
      .where('payout_id', payout.id)
      .firstOrFail()
  }

  async create(committee: Committee, payout: CommitteePayout, input: DrawInput, userId: number) {
    try {
      return await db.transaction(async (trx) => {
        const current = await Committee.query({ client: trx })
          .where('id', committee.id)
          .where('organization_id', committee.organizationId)
          .forUpdate()
          .firstOrFail()
        const round = await CommitteePayout.query({ client: trx })
          .where('id', payout.id)
          .where('committee_id', current.id)
          .where('organization_id', current.organizationId)
          .forUpdate()
          .firstOrFail()
        const existing = await CommitteeDraw.query({ client: trx })
          .where('organization_id', current.organizationId)
          .where('request_id', input.requestId)
          .first()
        if (existing) return this.retry(existing, round, input)
        if (
          current.status !== 'active' ||
          current.selectionType !== 'draw' ||
          current.overdueDrawAllowed === null
        )
          throw new Exception(
            'Draws require an active lucky-draw committee with an eligibility rule',
            { status: 409 }
          )
        if (round.status !== 'scheduled' || round.committeeMemberId !== null)
          throw new Exception('This round already has a selected recipient and cannot be redrawn', {
            status: 409,
          })

        const rounds = await CommitteePayout.query({ client: trx })
          .where('organization_id', current.organizationId)
          .where('committee_id', current.id)
          .select('id', 'committee_member_id', 'due_date')
        const selected = new Set(
          rounds.flatMap((item) => (item.committeeMemberId ? [item.committeeMemberId] : []))
        )
        const slots = await CommitteeMember.query({ client: trx })
          .where('organization_id', current.organizationId)
          .where('committee_id', current.id)
          .orderBy('slot_number')
        const overdueRounds = rounds.filter((item) => item.dueDate.toISODate()! < input.drawnOn)
        const expectedOverdue =
          toMinorUnits(current.contributionAmount) * BigInt(overdueRounds.length)
        const receivedBySlot = new Map<string, bigint>()
        if (!current.overdueDrawAllowed && overdueRounds.length) {
          const receipts = await trx
            .from('committee_contributions')
            .where('organization_id', current.organizationId)
            .where('committee_id', current.id)
            .whereIn(
              'payout_id',
              overdueRounds.map((item) => item.id)
            )
            .where('paid_on', '<=', input.drawnOn)
            .select('committee_member_id')
            .sum('amount as total')
            .groupBy('committee_member_id')
          for (const receipt of receipts)
            receivedBySlot.set(receipt.committee_member_id, toMinorUnits(receipt.total))
        }
        const eligibleSlots: EligibleSlot[] = slots
          .filter(
            (slot) =>
              slot.organizationMemberId &&
              !selected.has(slot.id) &&
              (current.overdueDrawAllowed || (receivedBySlot.get(slot.id) ?? 0n) >= expectedOverdue)
          )
          .map((slot) => ({
            committeeMemberId: slot.id,
            organizationMemberId: slot.organizationMemberId!,
            slotNumber: slot.slotNumber,
          }))
        if (!eligibleSlots.length)
          throw new Exception(
            'No eligible slots remain: all have been selected or have overdue contributions',
            { status: 409 }
          )
        const winner =
          eligibleSlots.length === 1
            ? eligibleSlots[0]
            : eligibleSlots[randomInt(eligibleSlots.length)]
        const now = DateTime.utc()
        const draw = await CommitteeDraw.create(
          {
            id: randomUUID(),
            organizationId: current.organizationId,
            committeeId: current.id,
            payoutId: round.id,
            committeeMemberId: winner.committeeMemberId,
            eligibleSlots,
            overdueDrawAllowed: current.overdueDrawAllowed,
            drawnOn: DateTime.fromISO(input.drawnOn, { zone: 'UTC' }),
            method: eligibleSlots.length === 1 ? 'automatic' : 'random',
            recordedBy: userId,
            requestId: input.requestId,
            createdAt: now,
          },
          { client: trx }
        )
        round.merge({
          committeeMemberId: winner.committeeMemberId,
          status: 'selected',
          selectedAt: now,
        })
        await round.save()
        return { draw, created: true }
      })
    } catch (error) {
      const failure = error as { code?: string; constraint?: string } | null
      if (failure?.code === '23505' && failure.constraint === 'committee_draws_request_unique') {
        const existing = await CommitteeDraw.query()
          .where('organization_id', committee.organizationId)
          .where('request_id', input.requestId)
          .firstOrFail()
        return this.retry(existing, payout, input)
      }
      throw error
    }
  }

  private retry(draw: CommitteeDraw, payout: CommitteePayout, input: DrawInput) {
    if (
      draw.committeeId !== payout.committeeId ||
      draw.payoutId !== payout.id ||
      draw.drawnOn.toISODate() !== input.drawnOn
    )
      throw new Exception('Request ID was already used for a different draw', { status: 409 })
    return { draw, created: false }
  }
}
