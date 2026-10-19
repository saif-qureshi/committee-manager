import { BaseTransformer } from '@adonisjs/core/transformers'
import type CommitteeMember from '#models/committee_member'
import OrganizationMemberTransformer from '#transformers/organization_member_transformer'

export default class CommitteeMemberTransformer extends BaseTransformer<CommitteeMember> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'committeeId',
        'slotNumber',
        'organizationMemberId',
        'createdAt',
        'updatedAt',
      ]),
      member: this.resource.member
        ? OrganizationMemberTransformer.transform(this.resource.member).depth(2)
        : null,
    }
  }
}
