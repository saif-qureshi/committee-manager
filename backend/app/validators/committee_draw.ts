import vine from '@vinejs/vine'
import type { Infer } from '@vinejs/vine/types'
import { calendarDate } from '#validators/calendar_date'

const drawParams = () =>
  vine.object({
    committeeId: vine.string().uuid(),
    payoutId: vine.string().uuid(),
  })

export const showCommitteeDrawValidator = vine.create({ params: drawParams() })
export const createCommitteeDrawValidator = vine.create({
  params: drawParams(),
  requestId: vine.string().uuid(),
  drawnOn: calendarDate(),
})

export type DrawInput = Omit<Infer<typeof createCommitteeDrawValidator>, 'params'>
