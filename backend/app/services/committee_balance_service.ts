import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import { formatAmount, toMinorUnits } from '#helpers/money'
import Committee from '#models/committee'
import CommitteePayout from '#models/committee_payout'

export default class CommitteeBalanceService {
  show(committee: Committee, asOf: string) {
    return db.transaction(async (trx) => {
      const current = await Committee.query({ client: trx })
        .where('id', committee.id)
        .where('organization_id', committee.organizationId)
        .forUpdate()
        .firstOrFail()
      if (current.status !== 'active')
        throw new Exception('Financial balances require an active committee', { status: 409 })

      const rounds = await CommitteePayout.query({ client: trx })
        .where('organization_id', current.organizationId)
        .where('committee_id', current.id)
        .select('id', 'due_date', 'expected_amount')
      const receipts = await trx
        .from('committee_contributions')
        .where('organization_id', current.organizationId)
        .where('committee_id', current.id)
        .where('paid_on', '<=', asOf)
        .select('payout_id')
        .sum('amount as total')
        .groupBy('payout_id')
      const handovers = await trx
        .from('committee_payout_payments')
        .where('organization_id', current.organizationId)
        .where('committee_id', current.id)
        .where('paid_on', '<=', asOf)
        .sum('amount as total')
        .first()
      const receivedByRound = new Map<string, bigint>(
        receipts.map((receipt) => [receipt.payout_id, toMinorUnits(receipt.total)])
      )
      const contributionPerRound =
        toMinorUnits(current.contributionAmount) * BigInt(current.slotCount)
      const expectedContributions = contributionPerRound * BigInt(rounds.length)
      let received = 0n
      let overdue = 0n
      let expectedPayouts = 0n
      for (const round of rounds) {
        const collected = receivedByRound.get(round.id) ?? 0n
        received += collected
        expectedPayouts += toMinorUnits(round.expectedAmount)
        if (round.dueDate.toISODate()! < asOf) overdue += contributionPerRound - collected
      }
      const paid = toMinorUnits(handovers?.total ?? '0.00')
      const remaining = expectedContributions - received
      return {
        committeeId: current.id,
        asOf,
        contributions: {
          expectedAmount: formatAmount(expectedContributions),
          receivedAmount: formatAmount(received),
          remainingAmount: formatAmount(remaining),
          overdueAmount: formatAmount(overdue),
          pendingAmount: formatAmount(remaining - overdue),
        },
        payouts: {
          expectedAmount: formatAmount(expectedPayouts),
          paidAmount: formatAmount(paid),
          remainingAmount: formatAmount(expectedPayouts - paid),
        },
        // shortcut: this excludes organizer funding and reversals until their ledgers exist.
        recordedNetAmount: formatAmount(received - paid),
      }
    })
  }
}
