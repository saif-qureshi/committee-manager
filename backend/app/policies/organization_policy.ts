import { AuthorizationResponse, BasePolicy } from '@adonisjs/bouncer'
import type User from '#models/user'
import type Organization from '#models/organization'
import OrganizationMember from '#models/organization_member'

export default class OrganizationPolicy extends BasePolicy {
  view(user: User, organization: Organization) {
    return this.isOrganizer(user, organization)
  }

  viewMembers(user: User, organization: Organization) {
    return this.isOrganizer(user, organization)
  }

  createInvitation(user: User, organization: Organization) {
    return this.isOrganizer(user, organization)
  }

  revokeInvitation(user: User, organization: Organization) {
    return this.isOrganizer(user, organization)
  }

  private async isOrganizer(user: User, organization: Organization) {
    if (organization.ownerId === user.id) {
      const membership = await OrganizationMember.query()
        .where('organization_id', organization.id)
        .where('user_id', user.id)
        .where('role', 'organizer')
        .first()
      if (membership) {
        return true
      }
    }
    return AuthorizationResponse.deny('Organization not found', 404)
  }
}
