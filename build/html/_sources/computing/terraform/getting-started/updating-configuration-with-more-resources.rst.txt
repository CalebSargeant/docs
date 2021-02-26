Updating Your Configuration with More Resources
===============================================

Terraform State
---------------

- JSON format (Do not touch!)
- Resource mappings and metadata
- Locking
- Location

  - Local
  - Remote: AWS, Azure, NFS, Terraform Cloud

- Workspaces

State File
^^^^^^^^^^

.. code-block:: json

  {
    "version": 4,
    "terraform_version": "0.12.5",
    "serial": 30,
    "lineage": "",
    "outputs": {},
    "resources": []
  }

.. note::

	First rule of Terraform? Make all changes in Terraform.

Terraform Plan
--------------

Terraform Planning
^^^^^^^^^^^^^^^^^^

- Inspect state
- Dependency graph
- Additions, updates, and deletions
- Parallel execution
- Save the plan

Adding a VPC
------------

.. code-block:: none

  resource "aws_vpc" "vpc" {}
  resource "aws_internet_gateway" "igw" {}
  resource "aws_subnet" "subnet" {}
  resource "aws_route_table" "rtb" {}
  resource "aws_route_table_association" "rta-subnet1" {}

Deploying a VPC
^^^^^^^^^^^^^^^

The below also includes an ELB and different availability zone for blue and red team deployment

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m4/modulefour-update.tf`

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m4/m4_commands.txt`
