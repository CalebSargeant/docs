Openstack
=========

Installing Openstack on Ubuntu
------------------------------

https://computingforgeeks.com/openstack-deployment-on-ubuntu-with-devstack/

.. code-block:: bash

  # Update && Upgrade
  sudo apt update -y && sudo apt upgrade -y

  # Add default non-root user to Sudoers
  nano /etc/sudoers
    # Allow members of group sudo to execute any command
    %sudo	ALL=(ALL:ALL) NOPASSWD:ALL

  # Download DevStack
  sudo apt install git -y
  cd ~ && git clone https://git.openstack.org/openstack-dev/devstack

  # Create local.conf
  cd devstack && nano local.conf
    [[local|localrc]]

    # Password for KeyStone, Database, RabbitMQ and Service
    ADMIN_PASSWORD=supersecurepassword
    DATABASE_PASSWORD=$ADMIN_PASSWORD
    RABBIT_PASSWORD=$ADMIN_PASSWORD
    SERVICE_PASSWORD=$ADMIN_PASSWORD

    # Host IP - get your Server/VM IP address from ip addr command
    HOST_IP=192.168.10.100

  # Deploy Openstack
  cd devstack && ./stack.sh

Random Scriptjies
-----------------

List all SG rules of grepped SG names:

.. code-block:: bash

  read -p 'Enter substring of SG: ' PX
  for SG in $(openstack security group list | grep $PX | awk '{print $4}')
    do
      echo $SG
      openstack security group rule list $SG | grep -w "10."* | awk '{print $4,$6,$8}' > $PX.log
    done

Text manipulation of SG list:

.. code-block:: bash

  # Remove the |
  openstack security group list | grep PX | sed 's/|//g'

  # Extract the 2nd column
  openstack security group list | grep PX | awk '{print $2}'

  # Extract the 1st row of the 2nd column
  openstack security group list | grep PX | awk 'NR==1{print $2}'

  # Extract the 1st row
  openstack security group list | grep PX | awk 'NR==1'

  # Extract the 1st row
  openstack security group list | grep PX | head -1

  # Count the number of rows
  openstack security group list | grep PX | wc -l

  ### SG Rule List
  openstack security group rule list xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

  # Add test to result
  openstack security group rule list xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx | grep -o '[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}' | perl -ne 'print "test $_"'

Lookup the machine(s) from IP Address:

.. code-block:: bash

  # List all VMs
  nova list --all-tenants | grep 10.249.0

  # IP Address Extractor
  grep -o '[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}\.[0-9]\{1,3\}'

  openstack security group rule list PX | grep -w "10."*

Remove all text before characters:

.. code-block:: bash

  sed 's/^.*10./10./'

Get ICMP rules:

.. code-block:: bash

  openstack security group rule list PX | grep -w "10."* | grep -v "icmp" | awk '{print $6,"_",$4,"_",$8}' | sed 's/ //g' | sed 's/:/-/g'

Inbound rule list extract:

.. code-block:: bash

  openstack security group rule list PX | grep -w "10."* | awk '{print $4,$6,$8}'
