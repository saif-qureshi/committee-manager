import OrganizationMember from '#models/organization_member'
import type Organization from '#models/organization'

export default class MembershipService {
  listForOrganizer(organization: Organization, page = 1) {
    return OrganizationMember.query()
      .where('organization_id', organization.id)
      .preload('user')
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .paginate(page, 25)
  }

  listForUser(userId: number, page = 1) {
    return OrganizationMember.query()
      .where('user_id', userId)
      .preload('organization')
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .paginate(page, 25)
  }
}
