Using a Module for Common Configurations
========================================

Terraform Modules
-----------------

- Code reuse
- Remote or local source

  - Terraform Registry

- Root module
- Versioning
- Provider inheritance
- Multiple instances (no count)

Module Components
^^^^^^^^^^^^^^^^^

- Input variables
- Resources
- Output values

Terraform Module Example
^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  variable "name" {}

  resource "aws_s3_bucket" "bucket" {
    name = var.name
    [...]
  }

  output "bucket_id" {
    value = aws_s3_bucket.bucket.id
  }

  #Create module bucket
  module "bucket" {
    name = "taco-bucket"
    source ./modules/s3
  }

  #Use taco-bucket
  resouce "aws_s3_bucket_object" {
    bucket = module.bucket.bucket_id
    [...]
  }

VPC Module
^^^^^^^^^^

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m8/resources.tf#L84`

S3 Module
^^^^^^^^^

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/tree/master/m8/Modules/s3`
