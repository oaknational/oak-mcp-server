resource "vercel_project" "docs" {
  name           = "oak-mcp-server-docs"
  team_id        = var.vercel_team_id
  framework      = "nextjs"
  root_directory = "apps/docs"

  build_command   = "pnpm --filter @oaknational/mcp-docs build"
  install_command = "pnpm install --frozen-lockfile"

  output_directory = "out"

  git_repository = {
    type = "github"
    repo = "oaknational/oak-mcp-server"
  }
}
