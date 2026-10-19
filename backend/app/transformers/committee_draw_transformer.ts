import { BaseTransformer } from '@adonisjs/core/transformers'
import type CommitteeDraw from '#models/committee_draw'

export default class CommitteeDrawTransformer extends BaseTransformer<CommitteeDraw> {
  toObject() {
    return {
      ...this.pick(this.resource, [
        'id',
        'committeeId',
        'payoutId',
        'committeeMemberId',
        'eligibleSlots',
        'overdueDrawAllowed',
        'method',
        'recordedBy',
        'requestId',
      ]),
      drawnOn: this.resource.drawnOn.toISODate(),
      createdAt: this.resource.createdAt.toUTC().toISO(),
    }
  }
}
