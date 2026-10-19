import router from '@adonisjs/core/services/router'
import { middleware } from '#start/kernel'
import { controllers } from '#generated/controllers'

router.get('/', () => ({ name: 'Committee Manager API' }))
router.get('/health', () => ({ status: 'ok' }))

router
  .group(() => {
    router.post('users', [controllers.Users, 'store'])
    router.post('sessions', [controllers.Sessions, 'store'])

    router
      .group(() => {
        router.get('users/me', [controllers.Users, 'show'])
        router.delete('sessions/current', [controllers.Sessions, 'destroy'])
        router.get('organization', [controllers.Organizations, 'show'])
        router.get('organization/members', [controllers.OrganizationMembers, 'index'])
        router.get('organization/committees', [controllers.Committees, 'index'])
        router.post('organization/committees', [controllers.Committees, 'store'])
        router.get('organization/committees/:committeeId', [controllers.Committees, 'show'])
        router.put('organization/committees/:committeeId', [controllers.Committees, 'update'])
        router.get('organization/committees/:committeeId/members', [
          controllers.CommitteeMembers,
          'index',
        ])
        router.put('organization/committees/:committeeId/members', [
          controllers.CommitteeMembers,
          'update',
        ])
        router.get('organization/committees/:committeeId/payouts', [
          controllers.CommitteePayouts,
          'index',
        ])
        router.put('organization/committees/:committeeId/payouts', [
          controllers.CommitteePayouts,
          'update',
        ])
        router.get('organization/committees/:committeeId/payouts/:payoutId/draw', [
          controllers.CommitteeDraws,
          'show',
        ])
        router.post('organization/committees/:committeeId/payouts/:payoutId/draw', [
          controllers.CommitteeDraws,
          'store',
        ])
        router.get('organization/committees/:committeeId/payouts/:payoutId/payments', [
          controllers.CommitteePayoutPayments,
          'index',
        ])
        router.post('organization/committees/:committeeId/payouts/:payoutId/payments', [
          controllers.CommitteePayoutPayments,
          'store',
        ])
        router.get('organization/committees/:committeeId/contributions', [
          controllers.CommitteeContributions,
          'index',
        ])
        router.post('organization/committees/:committeeId/contributions', [
          controllers.CommitteeContributions,
          'store',
        ])
        router.get('organization/committees/:committeeId/dues', [
          controllers.CommitteeDues,
          'index',
        ])
        router.get('organization/committees/:committeeId/balance', [
          controllers.CommitteeBalances,
          'show',
        ])
        router.get('organization/committees/:committeeId/schedule', [
          controllers.CommitteeSchedules,
          'show',
        ])
        router.post('organization/committees/:committeeId/activations', [
          controllers.CommitteeActivations,
          'store',
        ])
        router.get('memberships', [controllers.Memberships, 'index'])
        router.post('memberships', [controllers.Memberships, 'store'])
        router.post('organization/invitations', [controllers.Invitations, 'store'])
        router.delete('organization/invitations/:invitationId', [
          controllers.Invitations,
          'destroy',
        ])
      })
      .use(middleware.auth())
  })
  .prefix('/api/v1')
