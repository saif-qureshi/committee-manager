import vine from '@vinejs/vine'
import { loginIdentifier } from '#validators/login_identifier'

export const createInvitationValidator = vine.create({
  identifier: loginIdentifier(),
})

export const destroyInvitationValidator = vine.create({
  params: vine.object({
    invitationId: vine.string().uuid(),
  }),
})
