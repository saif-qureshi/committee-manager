import vine from '@vinejs/vine'

export const createAccountClaimValidator = vine.create({
  token: vine
    .string()
    .fixedLength(64)
    .regex(/^[a-f0-9]+$/),
  password: vine.string().minLength(8).maxLength(32),
  passwordConfirmation: vine.string().sameAs('password'),
})
