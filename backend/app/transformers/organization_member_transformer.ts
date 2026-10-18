import type OrganizationMember from '#models/organization_member'
import { BaseTransformer } from '@adonisjs/core/transformers'
import UserTransformer from '#transformers/user_transformer'

export default class OrganizationMemberTransformer extends BaseTransformer<OrganizationMember> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'organizationId', 'role', 'createdAt']),
      user: UserTransformer.transform(this.resource.user),
    }
  }
}
