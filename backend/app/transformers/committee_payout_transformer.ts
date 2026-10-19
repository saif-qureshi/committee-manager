import { BaseTransformer } from '@adonisjs/core/transformers'
import { formatAmount, toMinorUnits } from '#helpers/money'
import type CommitteePayout from '#models/committee_payout'

export default class CommitteePayoutTransformer extends BaseTransformer<CommitteePayout> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'committeeId',
        'roundNumber',
        'committeeMemberId',
        'expectedAmount',
        'paidAmount',
        'paidAt',
        'status',
        'selectedAt',
        'createdAt',
        'updatedAt',
      ]),
      remainingAmount: formatAmount(
        toMinorUnits(this.resource.expectedAmount) - toMinorUnits(this.resource.paidAmount)
      ),
      dueDate: this.resource.dueDate.toISODate(),
    }
  }
}
