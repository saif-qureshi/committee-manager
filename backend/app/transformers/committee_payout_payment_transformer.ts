import { BaseTransformer } from '@adonisjs/core/transformers'
import type CommitteePayoutPayment from '#models/committee_payout_payment'

export default class CommitteePayoutPaymentTransformer extends BaseTransformer<CommitteePayoutPayment> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'committeeId',
        'payoutId',
        'organizationMemberId',
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
