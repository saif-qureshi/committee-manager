import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteePayoutService from '#services/committee_payout_service'
import CommitteePayoutTransformer from '#transformers/committee_payout_transformer'
import { showCommitteeValidator } from '#validators/committee'
import { updateCommitteePayoutsValidator } from '#validators/committee_payout'

@inject()
export default class CommitteePayoutsController {
  constructor(private payouts: CommitteePayoutService) {}

  async index({ auth, bouncer, request, serialize }: HttpContext) {
    const { params } = await request.validateUsing(showCommitteeValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewCommittees', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    return serialize(CommitteePayoutTransformer.transform(await this.payouts.list(committee)))
  }

  async update({ auth, bouncer, request, serialize }: HttpContext) {
    const { params, payouts } = await request.validateUsing(updateCommitteePayoutsValidator)
    const user = auth.getUserOrFail()
    const organization = await user.related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('updateCommittee', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    return serialize(
      CommitteePayoutTransformer.transform(await this.payouts.update(committee, payouts))
    )
  }
}
