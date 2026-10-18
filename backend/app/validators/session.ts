import vine from '@vinejs/vine'
import { loginIdentifier } from '#validators/login_identifier'

export const createSessionValidator = vine.create({
  identifier: loginIdentifier(),
  password: vine.string().maxLength(32),
})
