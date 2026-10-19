import { BaseTransformer } from '@adonisjs/core/transformers'
import type { CommitteeDue } from '#services/committee_due_service'

export default class CommitteeDueTransformer extends BaseTransformer<CommitteeDue> {
  toObject() {
    return this.pick(this.resource, [
      'committeeMemberId',
      'slotNumber',
      'organizationMemberId',
      'fullName',
      'username',
      'phone',
      'payoutId',
      'roundNumber',
      'dueDate',
      'expectedAmount',
      'paidAmount',
      'remainingAmount',
      'status',
      'isPartiallyPaid',
      'daysOverdue',
    ])
  }
}
