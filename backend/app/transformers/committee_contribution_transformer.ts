import { BaseTransformer } from '@adonisjs/core/transformers'
import type CommitteeContribution from '#models/committee_contribution'

export default class CommitteeContributionTransformer extends BaseTransformer<CommitteeContribution> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'committeeId',
        'committeeMemberId',
        'organizationMemberId',
        'payoutId',
        'amount',
        'paymentMethod',
        'reference',
        'recordedBy',
        'requestId',
        'createdAt',
      ]),
      paidOn: this.resource.paidOn.toISODate(),
    }
  }
}
