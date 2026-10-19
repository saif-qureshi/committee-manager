import type OrganizationMember from '#models/organization_member'
import { BaseTransformer } from '@adonisjs/core/transformers'
import UserTransformer from '#transformers/user_transformer'

export default class OrganizationMemberTransformer extends BaseTransformer<OrganizationMember> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'organizationId', 'role', 'createdAt']),
      fullName: this.resource.user.fullName,
      phone: this.resource.user.phone,
      user: UserTransformer.transform(this.resource.user),
    }
  }
}
