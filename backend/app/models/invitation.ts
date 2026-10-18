import { InvitationSchema } from '#database/schema'
import { column } from '@adonisjs/lucid/orm'

export default class Invitation extends InvitationSchema {
  @column({ serializeAs: null })
  declare tokenHash: string
}
