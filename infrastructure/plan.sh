#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")/project"
# Keep providers and modules in the ignored .cache, out of reach of the repository's formatters and linters.
TF_DATA_DIR="${TF_DATA_DIR:-$(cd ../.. && pwd)/.cache/terraform}"
export TF_DATA_DIR

if ! command -v terraform >/dev/null; then
  echo "terraform is not on PATH. Install Terraform 1.5.7 or later." >&2
  exit 1
fi

workspaces="oak-mcp-server-project-function oak-mcp-server-project-docs"

terraform fmt -check -recursive -diff

if [ -z "${TF_TOKEN_app_terraform_io:-}" ] && ! grep -qs app.terraform.io "$HOME/.terraform.d/credentials.tfrc.json"; then
  terraform init -backend=false -input=false
  terraform validate
  echo "No Terraform Cloud token found, so terraform plan was skipped." \
    "Set TF_TOKEN_app_terraform_io or run terraform login to plan ${workspaces}."
  exit 0
fi

for workspace in $workspaces; do
  echo "== ${workspace}"
  TF_WORKSPACE="$workspace" terraform init -input=false
  TF_WORKSPACE="$workspace" terraform validate
  TF_WORKSPACE="$workspace" terraform plan -input=false
done
