import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteeDrawService from '#services/committee_draw_service'
import CommitteeDrawTransformer from '#transformers/committee_draw_transformer'
import {
  createCommitteeDrawValidator,
  showCommitteeDrawValidator,
} from '#validators/committee_draw'

@inject()
export default class CommitteeDrawsController {
  constructor(private draws: CommitteeDrawService) {}

  async show({ auth, bouncer, request, serialize }: HttpContext) {
    const { params } = await request.validateUsing(showCommitteeDrawValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewDraw', organization)
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
    return serialize(CommitteeDrawTransformer.transform(await this.draws.show(payout)))
  }

  async store({ auth, bouncer, request, response, serialize }: HttpContext) {
    const { params, ...input } = await request.validateUsing(createCommitteeDrawValidator)
    const user = auth.getUserOrFail()
    const organization = await user.related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('createDraw', organization)
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
    const result = await this.draws.create(committee, payout, input, user.id)
    response.status(result.created ? 201 : 200)
    return serialize(CommitteeDrawTransformer.transform(result.draw))
  }
}
