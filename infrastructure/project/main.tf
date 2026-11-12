resource "terraform_data" "workspace_validation" {
  lifecycle {
    precondition {
      condition     = terraform.workspace == "${local.workspace_prefix}${var.build_type}"
      error_message = "Workspace \"${terraform.workspace}\" does not match build_type \"${var.build_type}\". Expected ${local.workspace_prefix}${var.build_type}."
    }
  }
}

module "vercel" {
  source = "github.com/oaknational/oak-terraform-modules//modules/vercel_project?ref=v3.0.0"

  build_type                       = var.build_type
  cloudflare_zone_domain           = var.cloudflare_zone_domain
  git_repo                         = "oaknational/oak-mcp-server"
  project_visibility               = "public"
  protection_bypass_for_automation = true
  domains                          = []
  environment_variables            = local.environment_variables

  root_directory   = local.project.root_directory
  framework        = local.project.framework
  build_command    = local.project.build_command
  install_command  = local.project.install_command
  output_directory = local.project.output_directory
  ignore_command   = local.project.ignore_command
}
