import type OrganizationMember from '#models/organization_member'
import { BaseTransformer } from '@adonisjs/core/transformers'
import OrganizationTransformer from '#transformers/organization_transformer'

export default class MembershipTransformer extends BaseTransformer<OrganizationMember> {
  toObject() {
    return {
      ...this.pick(this.resource, ['id', 'userId', 'role', 'createdAt']),
      organization: OrganizationTransformer.transform(this.resource.organization),
    }
  }
}
