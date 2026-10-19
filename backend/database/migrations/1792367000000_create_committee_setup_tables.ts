import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  async up() {
    this.schema.createTable('committees', (table) => {
      table.uuid('id').primary()
      table.uuid('organization_id').notNullable().references('id').inTable('organizations')
      table.string('name', 120).notNullable()
      table.decimal('contribution_amount', 14, 2).notNullable()
      table.integer('slot_count').notNullable()
      table.enum('selection_type', ['fixed', 'draw']).notNullable()
      table.enum('frequency', ['weekly', 'monthly']).notNullable()
      table.date('first_due_date').notNullable()
      table.boolean('overdue_draw_allowed').nullable()
      table.enum('status', ['draft', 'active']).notNullable().defaultTo('draft')
      table.timestamp('activated_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table.unique(['organization_id', 'id'])
      table.index(['organization_id', 'created_at'])
      table.check('contribution_amount BETWEEN 0.01 AND 9999999999.99')
      table.check('slot_count BETWEEN 1 AND 100')
    })

    this.schema.createTable('committee_members', (table) => {
      table.uuid('id').primary()
      table.uuid('organization_id').notNullable()
      table.uuid('committee_id').notNullable()
      table.uuid('organization_member_id').nullable()
      table.integer('slot_number').notNullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table
        .foreign(['organization_id', 'committee_id'])
        .references(['organization_id', 'id'])
        .inTable('committees')
      table
        .foreign(['organization_id', 'organization_member_id'])
        .references(['organization_id', 'id'])
        .inTable('organization_members')
      table.unique(['committee_id', 'slot_number'])
      table.unique(['organization_id', 'committee_id', 'id'])
      table.check('slot_number BETWEEN 1 AND 100')
    })

    this.schema.createTable('committee_payouts', (table) => {
      table.uuid('id').primary()
      table.uuid('organization_id').notNullable()
      table.uuid('committee_id').notNullable()
      table.integer('round_number').notNullable()
      table.date('due_date').notNullable()
      table.uuid('committee_member_id').nullable()
      table.decimal('expected_amount', 14, 2).notNullable()
      table.decimal('paid_amount', 14, 2).notNullable().defaultTo(0)
      table
        .enum('status', ['scheduled', 'selected', 'partially_paid', 'paid'])
        .notNullable()
        .defaultTo('scheduled')
      table.timestamp('selected_at', { useTz: true }).nullable()
      table.timestamp('paid_at', { useTz: true }).nullable()
      table.timestamp('created_at', { useTz: true }).notNullable()
      table.timestamp('updated_at', { useTz: true }).notNullable()
      table
        .foreign(['organization_id', 'committee_id'])
        .references(['organization_id', 'id'])
        .inTable('committees')
      table
        .foreign(['organization_id', 'committee_id', 'committee_member_id'])
        .references(['organization_id', 'committee_id', 'id'])
        .inTable('committee_members')
      table.unique(['organization_id', 'committee_id', 'id'])
      table.unique(['committee_id', 'round_number'])
      table.unique(['committee_id', 'committee_member_id'])
      table.check('round_number BETWEEN 1 AND 100')
      table.check('expected_amount > 0')
      table.check('paid_amount >= 0 AND paid_amount <= expected_amount')
      table.check(
        "(status IN ('scheduled', 'selected') AND paid_amount = 0 AND paid_at IS NULL) OR (status = 'partially_paid' AND paid_amount > 0 AND paid_amount < expected_amount AND paid_at IS NULL) OR (status = 'paid' AND paid_amount = expected_amount AND paid_at IS NOT NULL)"
      )
      table.check(
        "(status = 'scheduled' AND selected_at IS NULL) OR (status <> 'scheduled' AND committee_member_id IS NOT NULL AND selected_at IS NOT NULL)"
      )
    })
  }

  async down() {
    this.schema.dropTable('committee_payouts')
    this.schema.dropTable('committee_members')
    this.schema.dropTable('committees')
  }
}
