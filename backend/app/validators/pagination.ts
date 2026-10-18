import vine from '@vinejs/vine'

export const paginationValidator = vine.create({
  page: vine.number().withoutDecimals().min(1).max(10000).optional(),
})
