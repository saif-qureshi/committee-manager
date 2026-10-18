import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('organizations', (table) => {
      table.uuid('id').primary()
      table.integer('owner_id').notNullable().unique().references('id').inTable('users')
      table.string('name', 120).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
    })

    this.schema.createTable('organization_members', (table) => {
      table.uuid('id').primary()
      table.uuid('organization_id').notNullable().references('id').inTable('organizations')
      table.integer('user_id').notNullable().references('id').inTable('users')
      table.enum('role', ['organizer', 'member']).notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.unique(['organization_id', 'user_id'])
      table.unique(['organization_id', 'id'])
      table.index(['user_id'])
    })

    this.schema.createTable('invitations', (table) => {
      table.uuid('id').primary()
      table.uuid('organization_id').notNullable()
      table.foreign('organization_id').references('id').inTable('organizations')
      table.string('recipient_identifier', 254).notNullable()
      table.string('token_hash', 64).notNullable().unique()
      table.timestamp('expires_at', { useTz: true }).notNullable()
      table.timestamp('accepted_at', { useTz: true }).nullable()
      table.timestamp('revoked_at', { useTz: true }).nullable()
      table.integer('accepted_by').nullable().references('id').inTable('users')
      table.integer('created_by').notNullable().references('id').inTable('users')
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.index(['organization_id', 'recipient_identifier'])
    })
  }

  async down() {
    this.schema.dropTable('invitations')
    this.schema.dropTable('organization_members')
    this.schema.dropTable('organizations')
  }
}
