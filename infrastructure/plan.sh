#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
# Keep providers and modules in the ignored .cache, out of reach of the repository's formatters and linters.
data_dir_base="${TF_DATA_DIR:-$(cd .. && pwd)/.cache/terraform}"

if ! command -v terraform >/dev/null; then
  echo "terraform is not on PATH. Install Terraform 1.5.7 or later." >&2
  exit 1
fi

terraform fmt -check -recursive -diff

has_token=true
if [ -z "${TF_TOKEN_app_terraform_io:-}" ] && ! grep -qs app.terraform.io "$HOME/.terraform.d/credentials.tfrc.json"; then
  has_token=false
fi

run_root() {
  dir="$1"
  workspaces="$2"
  echo "=== infrastructure/${dir}"
  # One data dir per root, so one root's selected workspace and providers never leak into the other.
  TF_DATA_DIR="${data_dir_base}/${dir}"
  export TF_DATA_DIR

  if [ "$has_token" = false ]; then
    terraform -chdir="$dir" init -backend=false -input=false
    terraform -chdir="$dir" validate
    echo "No Terraform Cloud token found, so terraform plan was skipped." \
      "Set TF_TOKEN_app_terraform_io or run terraform login to plan ${workspaces}."
    return
  fi

  for workspace in $workspaces; do
    echo "== ${workspace}"
    TF_WORKSPACE="$workspace" terraform -chdir="$dir" init -input=false
    TF_WORKSPACE="$workspace" terraform -chdir="$dir" validate
    TF_WORKSPACE="$workspace" terraform -chdir="$dir" plan -input=false
  done
}

run_root project "oak-mcp-server-project-function oak-mcp-server-project-docs"
run_root blob "oak-mcp-server-blob"
