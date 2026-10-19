import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteeDueService from '#services/committee_due_service'
import CommitteeDueTransformer from '#transformers/committee_due_transformer'
import { listCommitteeDuesValidator } from '#validators/committee_contribution'

@inject()
export default class CommitteeDuesController {
  constructor(private dues: CommitteeDueService) {}

  async index({ auth, bouncer, request, serialize }: HttpContext) {
    const { params, ...filters } = await request.validateUsing(listCommitteeDuesValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewContributionDues', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    const dues = await this.dues.list(committee, filters)
    return serialize(CommitteeDueTransformer.paginate(dues.all(), dues.getMeta()))
  }
}
