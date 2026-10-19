import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteePayoutPaymentService from '#services/committee_payout_payment_service'
import CommitteePayoutPaymentTransformer from '#transformers/committee_payout_payment_transformer'
import {
  createCommitteePayoutPaymentValidator,
  listCommitteePayoutPaymentsValidator,
} from '#validators/committee_payout_payment'

@inject()
export default class CommitteePayoutPaymentsController {
  constructor(private payments: CommitteePayoutPaymentService) {}

  async index({ auth, bouncer, request, serialize }: HttpContext) {
    const { params, page } = await request.validateUsing(listCommitteePayoutPaymentsValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewPayoutPayments', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    const payout = await committee
      .related('payouts')
      .query()
      .where('id', params.payoutId)
      .firstOrFail()
    const payments = await this.payments.list(payout, page)
    return serialize(CommitteePayoutPaymentTransformer.paginate(payments.all(), payments.getMeta()))
  }

  async store({ auth, bouncer, request, response, serialize }: HttpContext) {
    const { params, ...input } = await request.validateUsing(createCommitteePayoutPaymentValidator)
    const user = auth.getUserOrFail()
    const organization = await user.related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('recordPayoutPayment', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    const payout = await committee
      .related('payouts')
      .query()
      .where('id', params.payoutId)
      .firstOrFail()
    const result = await this.payments.create(committee, payout, input, user.id)
    response.status(result.created ? 201 : 200)
    return serialize(CommitteePayoutPaymentTransformer.transform(result.payment))
  }
}
