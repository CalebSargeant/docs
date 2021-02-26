Configuring a Resource After Creation
=====================================

Terraform Syntax
----------------

- HashiCorp configuration language
- Why not JSON?
- Human readable and editable
- Configuration syntax and expressions
- Conditionals, functions, templates

Blocks
^^^^^^

.. code-block:: none

  #Basic block
  block_type label_one label_two {
    key = value
    embedded_block {
      key = value
    }
  }

  #Example block
  resource "aws_route_table" "route-table" {
    vpc_id = "id928310928"
    route {
      cidr_block = "0.0.0.0/0"
      gateway_id = "id128073987"
    }
  }

Object Types
^^^^^^^^^^^^

.. code-block:: none

  #Different value types
  string = "taco"
  number = 5
  bool = true
  list = ["bean-taco", "beef-taco"]
  map = {name = "Caleb", age = 27, loves_tacos = true}

References
^^^^^^^^^^

.. code-block:: none

  #Keyword reference
  var.taco_day
  aws_instance_taco_truck.name
  local.taco_toppings.cheeses
  module.taco_hut.locations

  #Interpolation
  taco_name = "calebs-${var.taco_type}"

  #Strings, numbers, and bools
  local.taco_count # returns the number

  #Lists and maps
  local.taco_toppings[2] #returns element 3

  #Resource values
  var.region #returns us-east-1
  data.aws_availability_zones.azs.names[1] #returns 2nd AZ

Provisioners
------------

- Last resport
- Local or remote
- Creation or destruction
- Multiple provisioners
- What if it all goes wrong?

Provisioner Example
^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  provisioner "file" {
    connection {
      type = "ssh"
      user = "root"
      private_key = var.private_key
      host = var.hostname
    }
    source = "/local/path/to/file.txt"
    destination = "path/to/file.txt"
  }

  provisioner "local-exec" {
    command = "local command here"
  }

  provisioner "remote-exec" {
    scripts = ["lists", "of", "local", "scripts"]
  }

Variables and Tags & S3 Configuration
-------------------------------------

:download:`https://github.com/CalebSargeant/Getting-Started-Terraform/blob/master/m5/modulefive.tf`
