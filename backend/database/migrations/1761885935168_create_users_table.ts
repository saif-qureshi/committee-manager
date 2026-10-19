import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = 'users'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
      table.string('full_name').nullable()
      table.string('username', 30).nullable().unique()
      table.string('phone', 16).nullable().unique()
      table.check(
        'username IS NOT NULL OR phone IS NOT NULL',
        [],
        'users_login_identifier_required'
      )
      table.string('password').notNullable()
      table.boolean('is_pending').notNullable().defaultTo(false)

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
