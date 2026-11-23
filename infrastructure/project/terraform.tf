terraform {
  required_version = ">= 1.5.7"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "~> 3.14.1"
    }
  }

  cloud {
    organization = "oak-national-academy"
    workspaces {
      tags = ["repo:oak-mcp-server", "config:project"]
    }
  }
}
