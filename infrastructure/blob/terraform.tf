terraform {
  required_version = ">= 1.5.7"

  required_providers {
    vercel = {
      source  = "vercel/vercel"
      version = "5.25.0"
    }
  }

  cloud {
    organization = "oak-national-academy"
    workspaces {
      tags = ["repo:oak-mcp-server", "config:blob"]
    }
  }
}
