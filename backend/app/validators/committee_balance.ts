import vine from '@vinejs/vine'
import { calendarDate } from '#validators/calendar_date'
import { committeeParams } from '#validators/committee'

export const showCommitteeBalanceValidator = vine.create({
  params: committeeParams(),
  asOf: calendarDate(),
})
