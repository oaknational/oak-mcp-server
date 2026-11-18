locals {
  docs_workspace_owns_microfrontend_group = var.build_type == "docs"
}

provider "vercel" {
  team = "oak-national-academy"
}

data "vercel_project" "server" {
  count = local.docs_workspace_owns_microfrontend_group ? 1 : 0

  name = "oak-mcp-server-function"
}

resource "vercel_microfrontend_group" "docs_and_server" {
  count = local.docs_workspace_owns_microfrontend_group ? 1 : 0

  name = "oak-mcp-server"
  default_app = {
    project_id = module.vercel.project_id
  }
}

resource "vercel_microfrontend_group_membership" "server" {
  count = local.docs_workspace_owns_microfrontend_group ? 1 : 0

  microfrontend_group_id = vercel_microfrontend_group.docs_and_server[0].id
  project_id             = data.vercel_project.server[0].id
}
