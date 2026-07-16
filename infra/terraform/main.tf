terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = "us-east-1"
}

resource "aws_ecr_repository" "switchsignal" {
  name                 = "switchsignal"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "switchsignal_cleanup" {
  repository = aws_ecr_repository.switchsignal.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "expire old images beyond last 10"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

output "ecr_repository_url" {
  value = aws_ecr_repository.switchsignal.repository_url
}