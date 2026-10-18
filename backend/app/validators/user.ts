import vine from '@vinejs/vine'
import { normalizeLoginIdentifier } from '#validators/login_identifier'

const password = () => vine.string().minLength(8).maxLength(32)

export const createUserValidator = vine.create({
  accountType: vine.enum(['organizer', 'member']),
  organizationName: vine.string().trim().minLength(1).maxLength(120).optional(),
  fullName: vine.string().trim().maxLength(120).nullable(),
  username: vine
    .string()
    .trim()
    .regex(/^[A-Za-z][A-Za-z0-9_]{2,29}$/)
    .unique({ table: 'users', column: 'username' })
    .optional()
    .requiredIfMissing('phone'),
  phone: vine
    .string()
    .parse((value) => (typeof value === 'string' ? normalizeLoginIdentifier(value.trim()) : value))
    .regex(/^\+[1-9]\d{7,14}$/)
    .unique({ table: 'users', column: 'phone' })
    .optional()
    .requiredIfMissing('username'),
  password: password(),
  passwordConfirmation: password().sameAs('password'),
})
