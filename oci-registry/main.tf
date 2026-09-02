# Registry roots are opt-in. A reviewed tfvars file or TF_VAR_* environment
# values must enable each provider; defaults create no cloud resources.
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.91, < 7.0"
    }
    google = {
      source  = "hashicorp/google"
      version = ">= 6.0, < 8.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = ">= 4.52, < 6.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = ">= 5.24, < 6.0"
    }
  }
}

variable "enable_aws_ecr" {
  type    = bool
  default = false
}

variable "enable_gcp_artifact_registry" {
  type    = bool
  default = false
}

variable "enable_azure_acr" {
  type    = bool
  default = false
}

variable "enable_cloudflare_r2_backend" {
  type    = bool
  default = false
}

variable "gcp_project_id" {
  type    = string
  default = "CHANGE_ME"
}

variable "gcp_location" {
  type    = string
  default = "us-central1"
}

variable "azure_resource_group_name" {
  type    = string
  default = "CHANGE_ME"
}

variable "azure_location" {
  type    = string
  default = "East US"
}

variable "azure_registry_name" {
  type    = string
  default = "oresoteloci"
}

variable "cloudflare_account_id" {
  type      = string
  default   = null
  nullable  = true
  sensitive = true
}

variable "aws_lambda_source_arns" {
  type    = list(string)
  default = []
}

variable "aws_lambda_source_accounts" {
  type    = list(string)
  default = []
}

module "aws_ecr" {
  count  = var.enable_aws_ecr ? 1 : 0
  source = "git::https://github.com/zed-pkg/zed-infra.git//terraform/modules/oci-registry-fleet/aws-ecr?ref=a14d27928c6feb3600ca6c9dd0eda62c21a976a6"

  repository_name        = "ores-otel/lambda"
  oci_role               = "lambda"
  lambda_source_arns     = var.aws_lambda_source_arns
  lambda_source_accounts = var.aws_lambda_source_accounts
  tags = {
    github-org  = "ores-otel"
    github-repo = "ores-otel-infra"
  }
}

module "gcp_artifact_registry" {
  count  = var.enable_gcp_artifact_registry ? 1 : 0
  source = "git::https://github.com/zed-pkg/zed-infra.git//terraform/modules/oci-registry-fleet/gcp-artifact-registry?ref=a14d27928c6feb3600ca6c9dd0eda62c21a976a6"

  project_id    = var.gcp_project_id
  location      = var.gcp_location
  repository_id = "ores-otel-oci"
  oci_role      = "cloud-run"
  labels = {
    github-org  = "ores-otel"
    github-repo = "ores-otel-infra"
  }
}

module "azure_acr" {
  count  = var.enable_azure_acr ? 1 : 0
  source = "git::https://github.com/zed-pkg/zed-infra.git//terraform/modules/oci-registry-fleet/azure-acr?ref=a14d27928c6feb3600ca6c9dd0eda62c21a976a6"

  registry_name       = var.azure_registry_name
  resource_group_name = var.azure_resource_group_name
  location            = var.azure_location
  sku                 = "Basic"
  oci_role            = "azure-mirror"
  tags = {
    github-org  = "ores-otel"
    github-repo = "ores-otel-infra"
  }
}

module "cloudflare_r2_backend" {
  count  = var.enable_cloudflare_r2_backend ? 1 : 0
  source = "git::https://github.com/zed-pkg/zed-infra.git//terraform/modules/oci-registry-fleet/cloudflare-r2?ref=a14d27928c6feb3600ca6c9dd0eda62c21a976a6"

  account_id    = var.cloudflare_account_id
  bucket_name   = "ores-otel-oci-blobs"
  location      = "enam"
  storage_class = "Standard"
}

output "registry_targets" {
  description = "Promotion destinations. Null means the provider is disabled."
  value = {
    aws_ecr               = try(module.aws_ecr[0].repository_url, null)
    gcp_artifact_registry = try(module.gcp_artifact_registry[0].docker_repository, null)
    azure_acr             = try(module.azure_acr[0].login_server, null)
    cloudflare_r2_s3      = try(module.cloudflare_r2_backend[0].s3_endpoint, null)
    r2_is_direct_oci      = false
  }
}
