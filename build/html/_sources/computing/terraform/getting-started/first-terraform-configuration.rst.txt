Deploying Your First Terraform Configuration
============================================

Terraform Components
--------------------

- Terraform executable
- Terraform files
- Terraform plugins
- Terraform state

**Variables**

.. code-block:: none

  variable "aws_access_key" {}
  variable "aws_secret_key" {}

  variable "aws_region" {
    default = "us-east-1"
  }

**Provider**

.. code-block:: none

  provider "aws" {
    access_key = "var.access_key"
    secret_key = "var.secret_key"
    region = "var.aws_region"
  }

**Data**

.. code-block:: none

  data "aws_ami" "alx" {
    most_recent = true
    owners = ["amazon"]
    filters {}
  }

**Resource**

.. code-block:: none

  resource "aws_instance" "ex" {
    ami = "data.aws_ami.alx.id"
    instance_type = "t2.micro"
  }

**Output**

.. code-block:: none

  output "aws_public_ip" {
    value = "aws_instance.ex.public_dns"
  }

Examining the Configuration
---------------------------

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m3/module_three.tf`

Working with Variables
----------------------

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m3/terraform.tfvars.example`

Deploying the Configuration
---------------------------

.. code-block:: bash

  # List terraform commands
  terraform

  # Get the terraform version
  terraform version

  # Get AWS plugin and initialise configuration
  terraform init

  # Look at config files in directory and load variables
  terraform plan -out m3.tfplan

  # Executing what's in the plan
  terraform apply "m3.tfplan"

  # Looks at state file and what resources were created and destroys them
  terraform destroy
