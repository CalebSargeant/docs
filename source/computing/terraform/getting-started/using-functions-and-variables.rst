Using Functions and Variables
=============================

Working with Variables
----------------------

- Name, type, default
- Multiple sources

  - File, environment variable, var option

- Overriding variables and precedence

  - Environment, file, command line

- Select values based on environment
- Split Terraform configuration file

Variable Examples
^^^^^^^^^^^^^^^^^

.. code-block:: none

  #Specify default variable and type
  variable "environment_name" {
    type = string
    defualt = "development"
  }

  #Specify variable in file
  environment_name = "uat"

  #Specify variable in-file
  terraform plan -var 'environment_name=production'

  #Create variable map
  variable "cidr" {
    type = map(string)
    default = {
      development = "10.0.0.0/16"
      uat = "10.1.0.0/16"
      production = "10.2.0.0/16"
    }
  }

  #Use map based on environment
  cidr_block = lookup(var.cidr, var.environment_name)

Updating the Configuration Variables
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m7/variables.tf`

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m7/terraform.tfvars.example`

Multiple Environments
---------------------

- Commonality and differences
- Abstractiosn and ruse
- Production access
- Using workspaces

Multiple Environment Decisions
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- State management
- Variables data
- Credentials management
- Complexity and overhead

State File Example
^^^^^^^^^^^^^^^^^^

**Main**
- main.config.tf
- common.tfvars

**Dev**
- dev.state
- dev.tfvars
-``terraform plan -state="./dev/dev.state" -var-file="common.tfvars" -var-file="./dev/dev.tfvars"``

**UAT**
- uat.state
- uat.tfvars
- ``terraform plan -state="./uat/uat.state" -var-file="common.tfvars" -var-file="./uat/uat.tfvars"``

**Prod**
- prod.state
- prod.tfvars
- ``terraform plan -state="./prod/prod.state" -var-file="common.tfvars" -var-file="./prod/prod.tfvars"``

Workspaces Example
^^^^^^^^^^^^^^^^^^

- main.config.tf
- terraform.tfvars
- terraform.tfstate.d (folder)

.. code-block:: none

  terraform workspace new dev
  terraform plan

Managing Secrets
----------------

- Variables file
- Environment variable
- Secrets management

Environment Variables
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  #AWS Environment Variables
  AWS_ACCESSS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_SHARED_CREDENTIALS_FILE
  AWS_PROFILE

  #Powershell
  $env:AWS_ACCESS_KEY_ID="AASAS9283708FDKJ"

  #Linux
  export AWS_ACCESS_KEY_ID="AASAS9283708FDKJ"
