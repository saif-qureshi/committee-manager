import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import MembershipService from '#services/membership_service'
import InvitationService from '#services/invitation_service'
import MembershipTransformer from '#transformers/membership_transformer'
import { paginationValidator } from '#validators/pagination'
import { createMembershipValidator } from '#validators/membership'

@inject()
export default class MembershipsController {
  constructor(
    private memberships: MembershipService,
    private invitations: InvitationService
  ) {}

  async index({ auth, request, serialize }: HttpContext) {
    const { page } = await request.validateUsing(paginationValidator)
    const memberships = await this.memberships.listForUser(auth.getUserOrFail().id, page)
    return serialize(MembershipTransformer.paginate(memberships.all(), memberships.getMeta()))
  }

  async store({ auth, request, response, serialize }: HttpContext) {
    const { token } = await request.validateUsing(createMembershipValidator)
    const membership = await this.invitations.accept(auth.getUserOrFail(), token)
    response.status(201)
    return serialize(MembershipTransformer.transform(membership))
  }
}
