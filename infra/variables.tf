variable "project_id" {
  type        = string
  description = "The GCP project ID to deploy to."
}

variable "region" {
  type        = string
  description = "The region to deploy resources in."
  default     = "us-central1"
}
