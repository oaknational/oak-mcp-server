variable "build_type" {
  description = "The project this workspace manages: function (the MCP server) or docs."
  type        = string

  validation {
    condition     = contains(["function", "docs"], var.build_type)
    error_message = "build_type must be function or docs."
  }
}

variable "cloudflare_zone_domain" {
  description = "Domain name for the zone. The Vercel Projects variable set supplies it."
  type        = string
}

variable "env_vars" {
  description = "Non-sensitive environment variables. shared targets production and preview."
  type = object({
    shared  = optional(map(string), {})
    prod    = optional(map(string), {})
    preview = optional(map(string), {})
  })
  default = {}
}

variable "CLERK_SECRET_KEY_PREVIEW" {
  description = "Staging Clerk secret key."
  type        = string
  sensitive   = true
  default     = null
}

variable "OAK_API_KEY_PREVIEW" {
  description = "Oak Curriculum API key for previews."
  type        = string
  sensitive   = true
  default     = null
}

variable "ELASTICSEARCH_API_KEY_PREVIEW" {
  description = "API key for the staging search index."
  type        = string
  sensitive   = true
  default     = null
}

variable "SENTRY_AUTH_TOKEN_PREVIEW" {
  description = "Sentry auth token the build uses to upload source maps."
  type        = string
  sensitive   = true
  default     = null
}

variable "POSTHOG_PROJECT_API_KEY_PREVIEW" {
  description = "PostHog project key for the non-production project."
  type        = string
  sensitive   = true
  default     = null
}

variable "POSTHOG_PSEUDONYM_KEYRING_PREVIEW" {
  description = "PostHog pseudonym keyring, as a JSON array."
  type        = string
  sensitive   = true
  default     = null
}

variable "CRON_SECRET_PREVIEW" {
  description = "Bearer secret for /api/cron/refresh-graph on previews."
  type        = string
  sensitive   = true
  default     = null
}

variable "TEST_ERROR_SECRET_PREVIEW" {
  description = "Secret that gates the /test-error route. The server refuses to start with it in production."
  type        = string
  sensitive   = true
  default     = null
}

variable "BLOB_READ_WRITE_TOKEN_PREVIEW" {
  description = "Read-write token of the preview Blob store."
  type        = string
  sensitive   = true
  default     = null
}
