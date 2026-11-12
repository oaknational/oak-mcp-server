locals {
  workspace_prefix = "oak-mcp-server-project-"

  projects = {
    function = {
      root_directory   = "apps/server"
      framework        = "other"
      build_command    = "pnpm --filter @oaknational/mcp-server... build"
      install_command  = "pnpm install --frozen-lockfile"
      output_directory = null
      ignore_command   = "node runtime-only-scripts/vercel-ignore-production-non-release-build.mjs"
    }
    docs = {
      root_directory   = "apps/docs"
      framework        = "nextjs"
      build_command    = "pnpm --filter @oaknational/mcp-docs build"
      install_command  = "pnpm install --frozen-lockfile"
      output_directory = "out"
      # Exit 0 skips the build, so production builds never run.
      ignore_command = "[ \"$VERCEL_ENV\" = production ]"
    }
  }

  project = local.projects[var.build_type]

  env_groups = {
    shared  = ["production", "preview"]
    prod    = ["production"]
    preview = ["preview"]
  }

  non_sensitive_vars = flatten([
    for group, target in local.env_groups : [
      for key, value in var.env_vars[group] : {
        key       = key
        value     = value
        target    = target
        sensitive = false
      }
    ]
  ])

  sensitive_env_vars = {
    shared = {}
    prod   = {}
    preview = {
      CLERK_SECRET_KEY          = var.CLERK_SECRET_KEY_PREVIEW
      OAK_API_KEY               = var.OAK_API_KEY_PREVIEW
      ELASTICSEARCH_API_KEY     = var.ELASTICSEARCH_API_KEY_PREVIEW
      SENTRY_AUTH_TOKEN         = var.SENTRY_AUTH_TOKEN_PREVIEW
      POSTHOG_PROJECT_API_KEY   = var.POSTHOG_PROJECT_API_KEY_PREVIEW
      POSTHOG_PSEUDONYM_KEYRING = var.POSTHOG_PSEUDONYM_KEYRING_PREVIEW
      CRON_SECRET               = var.CRON_SECRET_PREVIEW
      TEST_ERROR_SECRET         = var.TEST_ERROR_SECRET_PREVIEW
      BLOB_READ_WRITE_TOKEN     = var.BLOB_READ_WRITE_TOKEN_PREVIEW
    }
  }

  sensitive_vars = flatten([
    for group, target in local.env_groups : [
      for key, value in local.sensitive_env_vars[group] : {
        key       = key
        value     = value
        target    = target
        sensitive = true
      } if value != null
    ]
  ])

  environment_variables = concat(local.non_sensitive_vars, local.sensitive_vars)
}
