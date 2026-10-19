import vine from '@vinejs/vine'
import { calendarDate } from '#validators/calendar_date'
import type { Infer } from '@vinejs/vine/types'

const fields = () => ({
  name: vine.string().trim().minLength(1).maxLength(120),
  contributionAmount: vine
    .string()
    .trim()
    .regex(/^(?!0(?:\.0{1,2})?$)(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),
  slotCount: vine.number().withoutDecimals().min(1).max(100),
  selectionType: vine.enum(['fixed', 'draw']),
  frequency: vine.enum(['weekly', 'monthly']),
  firstDueDate: calendarDate(),
  overdueDrawAllowed: vine.boolean().nullable(),
})

export const committeeParams = () => vine.object({ committeeId: vine.string().uuid() })
export const createCommitteeValidator = vine.create(fields())
export const updateCommitteeValidator = vine.create({ params: committeeParams(), ...fields() })
export const showCommitteeValidator = vine.create({ params: committeeParams() })
export type CommitteeInput = Infer<typeof createCommitteeValidator>
