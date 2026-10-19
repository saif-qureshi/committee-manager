import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteeScheduleService from '#services/committee_schedule_service'
import { showCommitteeValidator } from '#validators/committee'

@inject()
export default class CommitteeSchedulesController {
  constructor(private schedules: CommitteeScheduleService) {}

  async show({ auth, bouncer, request, serialize }: HttpContext) {
    const { params } = await request.validateUsing(showCommitteeValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewCommittees', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    return serialize(await this.schedules.preview(committee))
  }
}
