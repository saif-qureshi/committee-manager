import { randomUUID } from 'node:crypto'
import { formatAmount, toMinorUnits } from '#helpers/money'
import { DateTime } from 'luxon'
import { inject } from '@adonisjs/core'
import { Exception } from '@adonisjs/core/exceptions'
import db from '@adonisjs/lucid/services/db'
import type { TransactionClientContract } from '@adonisjs/lucid/types/database'
import type Organization from '#models/organization'
import Committee from '#models/committee'
import CommitteeMember from '#models/committee_member'
import CommitteePayout from '#models/committee_payout'
import CommitteeScheduleService from '#services/committee_schedule_service'
import type { CommitteeInput } from '#validators/committee'

@inject()
export default class CommitteeService {
  constructor(private schedules: CommitteeScheduleService) {}

  list(organization: Organization, page = 1) {
    return organization
      .related('committees')
      .query()
      .withCount('members', (query) =>
        query.whereNotNull('organization_member_id').as('assigned_member_count')
      )
      .orderBy('created_at', 'desc')
      .orderBy('id')
      .paginate(page, 25)
  }

  create(organization: Organization, input: CommitteeInput) {
    return db.transaction(async (trx) => {
      const committee = await Committee.create(
        {
          ...this.values(input),
          id: randomUUID(),
          organizationId: organization.id,
          status: 'draft',
        },
        { client: trx }
      )
      await this.createSlots(committee, trx)
      return committee
    })
  }

  update(committee: Committee, input: CommitteeInput) {
    return db.transaction(async (trx) => {
      const current = await Committee.query({ client: trx })
        .where('id', committee.id)
        .where('organization_id', committee.organizationId)
        .forUpdate()
        .firstOrFail()
      if (current.status !== 'draft')
        throw new Exception('Only draft committees can be edited', { status: 409 })
      const resize = current.slotCount !== input.slotCount
      const changeMode = current.selectionType !== input.selectionType
      if (
        (resize || changeMode) &&
        (await CommitteeMember.query({ client: trx })
          .where('committee_id', current.id)
          .whereNotNull('organization_member_id')
          .first())
      ) {
        throw new Exception('Clear member assignments before changing slot count or payout mode', {
          status: 409,
        })
      }
      current.merge(this.values(input))
      await current.save()
      if (resize) {
        await CommitteePayout.query({ client: trx }).where('committee_id', current.id).delete()
        await CommitteeMember.query({ client: trx }).where('committee_id', current.id).delete()
        await this.createSlots(current, trx)
      } else {
        const members = await CommitteeMember.query({ client: trx }).where(
          'committee_id',
          current.id
        )
        if (changeMode) {
          await CommitteePayout.query({ client: trx })
            .where('committee_id', current.id)
            .update({ committeeMemberId: null })
        }
        for (const row of this.schedules.rows(current)) {
          await CommitteePayout.query({ client: trx })
            .where('committee_id', current.id)
            .where('round_number', row.roundNumber)
            .update({
              ...row,
              ...(changeMode
                ? {
                    committeeMemberId:
                      current.selectionType === 'fixed'
                        ? members.find((member) => member.slotNumber === row.roundNumber)!.id
                        : null,
                  }
                : {}),
              updatedAt: DateTime.utc(),
            })
        }
      }
      await current.loadCount('members', (query) =>
        query.whereNotNull('organization_member_id').as('assigned_member_count')
      )
      return current
    })
  }

  private values(input: CommitteeInput) {
    return {
      name: input.name,
      contributionAmount: formatAmount(toMinorUnits(input.contributionAmount)),
      slotCount: input.slotCount,
      selectionType: input.selectionType,
      frequency: input.frequency,
      firstDueDate: DateTime.fromISO(input.firstDueDate, { zone: 'UTC' }),
      overdueDrawAllowed: input.selectionType === 'draw' ? input.overdueDrawAllowed : null,
    }
  }

  private async createSlots(committee: Committee, trx: TransactionClientContract) {
    const members = await CommitteeMember.createMany(
      Array.from({ length: committee.slotCount }, (_, index) => ({
        id: randomUUID(),
        organizationId: committee.organizationId,
        committeeId: committee.id,
        organizationMemberId: null,
        slotNumber: index + 1,
      })),
      { client: trx }
    )
    await CommitteePayout.createMany(
      this.schedules.rows(committee).map((row) => ({
        ...row,
        id: randomUUID(),
        organizationId: committee.organizationId,
        committeeId: committee.id,
        committeeMemberId:
          committee.selectionType === 'fixed'
            ? members.find((member) => member.slotNumber === row.roundNumber)!.id
            : null,
        status: 'scheduled',
        selectedAt: null,
      })),
      { client: trx }
    )
  }
}
