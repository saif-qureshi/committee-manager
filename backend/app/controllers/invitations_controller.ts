import { inject } from '@adonisjs/core'
import type { HttpContext } from '@adonisjs/core/http'
import OrganizationPolicy from '#policies/organization_policy'
import InvitationService from '#services/invitation_service'
import { createInvitationValidator, destroyInvitationValidator } from '#validators/invitation'

@inject()
export default class InvitationsController {
  constructor(private invitations: InvitationService) {}

  async store({ auth, bouncer, request, response, serialize }: HttpContext) {
    const { identifier } = await request.validateUsing(createInvitationValidator)
    const user = auth.getUserOrFail()
    const organization = await user.related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('createInvitation', organization)
    const invitation = await this.invitations.create(organization, user.id, identifier)
    response.status(201)
    return serialize(invitation)
  }

  async destroy({ auth, bouncer, request, response }: HttpContext) {
    const { params } = await request.validateUsing(destroyInvitationValidator)
    const organization = await auth.getUserOrFail().related('organization').query().firstOrFail()
    await bouncer.with(OrganizationPolicy).authorize('revokeInvitation', organization)
    await this.invitations.revoke(organization, params.invitationId)
    return response.noContent()
  }
}
