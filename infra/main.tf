locals {
  apis = [
    "firestore.googleapis.com",
    "cloudfunctions.googleapis.com",
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "storage.googleapis.com",
    "firebaserules.googleapis.com",
    "firebase.googleapis.com"
  ]
}

# Enable APIs
resource "google_project_service" "apis" {
  for_each           = toset(local.apis)
  project            = var.project_id
  service            = each.key
  disable_on_destroy = false
}

# Create Firestore Database in Native mode
resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [
    google_project_service.apis
  ]
}

# Enable Firebase for the project (required for Firebase Rules)
resource "google_firebase_project" "firebase" {
  provider   = google-beta
  project    = var.project_id
  depends_on = [google_project_service.apis]
}

# Random ID for bucket suffix
resource "random_id" "bucket_suffix" {
  byte_length = 4
}

# Storage bucket for Cloud Function source zip
resource "google_storage_bucket" "function_bucket" {
  name                        = "parking-lot-function-source-${random_id.bucket_suffix.hex}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  depends_on = [
    google_project_service.apis
  ]
}

# Package the Cloud Function source
data "archive_file" "function_zip" {
  type        = "zip"
  source_dir  = "${path.module}/../functions/spot-handler"
  output_path = "${path.module}/../functions/spot-handler.zip"
}

# Upload the source code zip to GCS
resource "google_storage_bucket_object" "function_source" {
  name   = "spot-handler-${data.archive_file.function_zip.output_md5}.zip"
  bucket = google_storage_bucket.function_bucket.name
  source = data.archive_file.function_zip.output_path
}

# Dedicated service account for Cloud Function
resource "google_service_account" "function_sa" {
  account_id   = "spot-handler-sa"
  display_name = "Spot Handler Cloud Function Service Account"

  depends_on = [
    google_project_service.apis
  ]
}

# IAM permissions for Firestore access
resource "google_project_iam_member" "firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.function_sa.email}"
}

# Deploy the 2nd Gen Cloud Function
resource "google_cloudfunctions2_function" "function" {
  name        = "spot-handler"
  location    = var.region
  description = "Handles parking lot occupancy update requests"

  build_config {
    runtime     = "nodejs22"
    entry_point = "spotHandler"
    source {
      storage_source {
        bucket = google_storage_bucket.function_bucket.name
        object = google_storage_bucket_object.function_source.name
      }
    }
  }

  service_config {
    max_instance_count    = 3
    available_memory      = "256Mi"
    timeout_seconds       = 60
    service_account_email = google_service_account.function_sa.email
  }

  depends_on = [
    google_project_service.apis,
    google_firestore_database.database
  ]
}

# Make the Cloud Function publicly reachable
resource "google_cloud_run_service_iam_member" "public_access" {
  location = google_cloudfunctions2_function.function.location
  project  = google_cloudfunctions2_function.function.project
  service  = google_cloudfunctions2_function.function.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Create a GCS bucket for hosting the static website
resource "google_storage_bucket" "static_site" {
  name                        = "parking-lot-static-site-${random_id.bucket_suffix.hex}"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  website {
    main_page_suffix = "index.html"
    not_found_page   = "index.html"
  }

  depends_on = [
    google_project_service.apis
  ]
}

# Grant public read access to the bucket objects
resource "google_storage_bucket_iam_member" "public_bucket" {
  bucket = google_storage_bucket.static_site.name
  role   = "roles/storage.objectViewer"
  member = "allUsers"
}

locals {
  # Map file extensions to MIME types
  mime_types = {
    "html" = "text/html"
    "js"   = "application/javascript"
    "css"  = "text/css"
  }
}

# Upload all files in the static directory to the GCS bucket
resource "google_storage_bucket_object" "static_files" {
  # fileset() finds all files matching the pattern
  for_each = fileset("${path.module}/../static", "*")

  name   = each.value
  bucket = google_storage_bucket.static_site.name
  source = "${path.module}/../static/${each.value}"

  # Dynamically determine content_type based on file extension
  content_type = lookup(
    local.mime_types, 
    split(".", each.value)[length(split(".", each.value)) - 1], 
    "application/octet-stream"
  )
}

output "function_url" {
  value       = google_cloudfunctions2_function.function.url
  description = "The URL of the deployed Cloud Function"
}

output "static_site_url" {
  value       = "https://storage.googleapis.com/${google_storage_bucket.static_site.name}/index.html"
  description = "The URL of the static website hosted on GCS"
}
