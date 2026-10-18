import vine from '@vinejs/vine'

export const createMembershipValidator = vine.create({
  token: vine
    .string()
    .fixedLength(64)
    .regex(/^[a-f0-9]+$/),
})
