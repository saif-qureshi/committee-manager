# Deployment

Production target: a paid VPS running an AdonisJS API, PostgreSQL, and Caddy through Docker Compose.

The root [compose.yaml](../compose.yaml) starts only the local-development database. Production API images, HTTPS configuration, private upload storage, restricted database roles, monitoring, and encrypted off-server backups will be added in `deploy/` during the deployment phase. Do not use local example credentials in production.
