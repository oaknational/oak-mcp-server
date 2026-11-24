# The project root's vercel_project module pins provider ~> 3.14.1, and vercel_blob_store needs v5, so the stores live in their own root.
provider "vercel" {
  team = "oak-national-academy"
}

locals {
  stores = {
    preview    = "oak-mcp-server-preview"
    production = "oak-mcp-server-production"
  }
}

data "vercel_project" "server" {
  name = "oak-mcp-server-function"
}

resource "vercel_blob_store" "this" {
  for_each = local.stores

  name   = each.value
  access = "private"
  region = "lhr1"
}

resource "vercel_blob_project_connection" "server" {
  for_each = vercel_blob_store.this

  blob_store_id  = each.value.id
  project_id     = data.vercel_project.server.id
  env_var_prefix = "BLOB"
  environments   = [each.key]
}
