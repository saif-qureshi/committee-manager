import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import CommitteeMemberService from '#services/committee_member_service'
import CommitteeMemberTransformer from '#transformers/committee_member_transformer'
import { showCommitteeValidator } from '#validators/committee'
import { updateCommitteeMembersValidator } from '#validators/committee_member'

@inject()
export default class CommitteeMembersController {
  constructor(private members: CommitteeMemberService) {}

  async index({ auth, bouncer, request, serialize }: HttpContext) {
    const { params } = await request.validateUsing(showCommitteeValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewCommittees', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    return serialize(CommitteeMemberTransformer.transform(await this.members.list(committee)))
  }

  async update({ auth, bouncer, request, serialize }: HttpContext) {
    const { params, members } = await request.validateUsing(updateCommitteeMembersValidator)
    const user = auth.getUserOrFail()
    const organization = await user.related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('updateCommittee', organization)
    const committee = await organization
      .related('committees')
      .query()
      .where('id', params.committeeId)
      .firstOrFail()
    return serialize(
      CommitteeMemberTransformer.transform(await this.members.update(committee, members))
    )
  }
}
