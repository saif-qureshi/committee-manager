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
