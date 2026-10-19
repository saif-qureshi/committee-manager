import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteeScheduleService from '#services/committee_schedule_service'
import CommitteeTransformer from '#transformers/committee_transformer'
import { showCommitteeValidator } from '#validators/committee'

@inject()
export default class CommitteeActivationsController {
  constructor(private schedules: CommitteeScheduleService) {}

  async store({ auth, bouncer, request, response, serialize }: HttpContext) {
    const { params } = await request.validateUsing(showCommitteeValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('activateCommittee', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    const activation = await this.schedules.activate(committee)
    response.status(activation.created ? 201 : 200)
    return serialize(CommitteeTransformer.transform(activation.committee))
  }
}
