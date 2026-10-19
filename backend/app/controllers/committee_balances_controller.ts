import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteeBalanceService from '#services/committee_balance_service'
import { showCommitteeBalanceValidator } from '#validators/committee_balance'

@inject()
export default class CommitteeBalancesController {
  constructor(private balances: CommitteeBalanceService) {}

  async show({ auth, bouncer, request, serialize }: HttpContext) {
    const { params, asOf } = await request.validateUsing(showCommitteeBalanceValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewCommitteeBalance', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    return serialize(await this.balances.show(committee, asOf))
  }
}
