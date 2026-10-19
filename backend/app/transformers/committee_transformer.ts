import { BaseTransformer } from '@adonisjs/core/transformers'
import type Committee from '#models/committee'

export default class CommitteeTransformer extends BaseTransformer<Committee> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'organizationId',
        'name',
        'status',
        'contributionAmount',
        'slotCount',
        'selectionType',
        'frequency',
        'overdueDrawAllowed',
        'activatedAt',
        'createdAt',
        'updatedAt',
      ]),
      firstDueDate: this.resource.firstDueDate.toISODate(),
      assignedMemberCount: Number(this.resource.$extras.assigned_member_count ?? 0),
    }
  }
}
