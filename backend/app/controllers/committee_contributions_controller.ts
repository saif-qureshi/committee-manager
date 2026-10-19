import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteeContributionService from '#services/committee_contribution_service'
import CommitteeContributionTransformer from '#transformers/committee_contribution_transformer'
import {
  createCommitteeContributionValidator,
  listCommitteeContributionsValidator,
} from '#validators/committee_contribution'

@inject()
export default class CommitteeContributionsController {
  constructor(private contributions: CommitteeContributionService) {}

  async index({ auth, bouncer, request, serialize }: HttpContext) {
    const { params, ...filters } = await request.validateUsing(listCommitteeContributionsValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewContributions', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    const contributions = await this.contributions.list(committee, filters)
    return serialize(
      CommitteeContributionTransformer.paginate(contributions.all(), contributions.getMeta())
    )
  }

  async store({ auth, bouncer, request, response, serialize }: HttpContext) {
    const { params, ...input } = await request.validateUsing(createCommitteeContributionValidator)
    const user = auth.getUserOrFail()
    const organization = await user.related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('recordContribution', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    const result = await this.contributions.create(committee, input, user.id)
    response.status(result.created ? 201 : 200)
    return serialize(CommitteeContributionTransformer.transform(result.contribution))
  }
}
