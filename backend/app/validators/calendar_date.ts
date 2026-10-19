import vine from '@vinejs/vine'
import { DateTime } from 'luxon'

const calendarDateRule = vine.createRule((value, _options, field) => {
  if (typeof value !== 'string') return
  const date = DateTime.fromISO(value, { zone: 'UTC' })
  if (!date.isValid || date.year < 1900 || date.year > 2100) {
    field.report(
      'The {{ field }} must be a valid calendar date between 1900 and 2100',
      'calendarDate',
      field
    )
  }
})

export const calendarDate = () =>
  vine
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .use(calendarDateRule())
