import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import MembershipService from '#services/membership_service'
import OrganizationMemberTransformer from '#transformers/organization_member_transformer'
import { paginationValidator } from '#validators/pagination'

@inject()
export default class OrganizationMembersController {
  constructor(private membershipsService: MembershipService) {}

  async index({ auth, bouncer, request, serialize }: HttpContext) {
    const { page } = await request.validateUsing(paginationValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('viewMembers', organization)
    const members = await this.membershipsService.listForOrganizer(organization, page)
    return serialize(OrganizationMemberTransformer.paginate(members.all(), members.getMeta()))
  }
}
