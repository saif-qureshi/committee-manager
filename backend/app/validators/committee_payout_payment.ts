import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { calendarDate } from '#validators/calendar_date'

const payoutParams = () =>
  vine.object({
    committeeId: vine.string().uuid(),
    payoutId: vine.string().uuid(),
  })

export const listCommitteePayoutPaymentsValidator = vine.create({
  params: payoutParams(),
  page: vine.number().withoutDecimals().min(1).max(10000).optional(),
})

export const createCommitteePayoutPaymentValidator = vine.create({
  params: payoutParams(),
  requestId: vine.string().uuid(),
  amount: vine
    .string()
    .trim()
    .regex(/^(?!0(?:\.0{1,2})?$)(?:0|[1-9]\d{0,11})(?:\.\d{1,2})?$/),
  paidOn: calendarDate(),
  paymentMethod: vine.enum(['cash', 'bank_transfer', 'easypaisa', 'jazzcash', 'other']),
  reference: vine.string().trim().maxLength(120).nullable().optional(),
})

export type PayoutPaymentInput = Omit<Infer<typeof createCommitteePayoutPaymentValidator>, 'params'>
