import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { calendarDate } from '#validators/calendar_date'
import { committeeParams } from '#validators/committee'

export const createCommitteeContributionValidator = vine.create({
  params: committeeParams(),
  committeeMemberId: vine.string().uuid(),
  payoutId: vine.string().uuid(),
  requestId: vine.string().uuid(),
  amount: vine
    .string()
    // Body parsing turns blank amounts into null; only an omitted amount means full payment.
    .parse((value) => (value === null ? '' : value))
    .trim()
    .regex(/^(?!0(?:\.0{1,2})?$)(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/)
    .optional(),
  paidOn: calendarDate(),
  paymentMethod: vine.enum(['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'other']),
  reference: vine.string().trim().maxLength(120).nullable().optional(),
})

export const listCommitteeContributionsValidator = vine.create({
  params: committeeParams(),
  committeeMemberId: vine.string().uuid().optional(),
  payoutId: vine.string().uuid().optional(),
  page: vine.number().withoutDecimals().min(1).max(10000).optional(),
})

export const listCommitteeDuesValidator = vine.create({
  params: committeeParams(),
  asOf: calendarDate(),
  status: vine.enum(['pending', 'overdue', 'paid']).optional(),
  committeeMemberId: vine.string().uuid().optional(),
  page: vine.number().withoutDecimals().min(1).max(10000).optional(),
})

export type ContributionInput = Omit<Infer<typeof createCommitteeContributionValidator>, 'params'>
export type ContributionFilters = Omit<Infer<typeof listCommitteeContributionsValidator>, 'params'>
export type DueFilters = Omit<Infer<typeof listCommitteeDuesValidator>, 'params'>
