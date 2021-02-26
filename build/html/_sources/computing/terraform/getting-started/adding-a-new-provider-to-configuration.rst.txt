Adding a New Provider to Your Configuration
===========================================

Terraform Functions
-------------------

- Built-in to Terraform
- Func_name(arg1, arg2, arg3, ...)
- Test in terrafrom console
- Several broad categories

Common Function Categories
^^^^^^^^^^^^^^^^^^^^^^^^^^

- Numeric

  - min(42, 13, 7)

- String

  - lower("TACOS")

- Collection

  - merge(map1, map2)

- Filesystem

  - file(path)

- IP network

  - cidrsubnet()

- Date and time

  - timestamp()

Function Examples
^^^^^^^^^^^^^^^^^

.. code-block:: none

  #Configure networking
  variable network_info {
    default = "10.1.0.0/16" #type, default, description
  }

  #Returns 10.1.0.0/24
  cidr_block = cidrsubnet(var.network_info, 8, 0)

  #Returns 10.1.0.5
  host_ip = cidrhost(var.network_info,5)

  #Create ami map
  variable "amis" {
    type = "map"
    default = {
      us-east-1 = "ami-1234"
      us-west-1 = "ami-5678"
    }
  }
  ami = lookup(var.amis, "us-east-1", "error")

Terraform Commands
------------------

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m6/m6_commands.txt`

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m6/modulesix.tf`

Terraform Providers
-------------------

- Iaas, Paas, Saas
- Community and HashiCorp
- Open source
- Resources and data sources
- Multiple instances

Provider Example
^^^^^^^^^^^^^^^^

.. code-block:: none

  provider "azurerm" {
    subscription_id = "subscription-id"
    client_id = "principal-used-for-access"
    client_secret = "password-of-principal"
    tenant_id = "tenant-id"
    alias = "arm-1"
  }
  resource "azurerm_resource_group" "azure_tacos" {
    name = "resource-group-name"
    location = "East US"
    provider = azurerm.arm-1
  }

Adding the AzureRM Provider
---------------------------

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m6/modulesix.tf`

Resource Arguments
------------------

- depends_on
- count
- for_each
- provider

Depends_on and Count
^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  resource "aws_instance" "taco_servers" {
    count = 2
    tags {
      Name = "customer-${count.index}"
    }
    depends_on = [aws_iam_role_policy.allow_s3]
  }

For_each
^^^^^^^^

.. code-block:: none

  resource "aws_s3_bucket" "taco_toppings" {
    for_each = {
      food = "public-read"
      cash = "private"
    }
    bucket = "${each.key}-${var.bucket_suffix}"
    acl = each.value
  }

Using the Count Argument
------------------------

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m6/modulesix.tf`
