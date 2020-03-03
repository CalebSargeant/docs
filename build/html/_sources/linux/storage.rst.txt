Storage
=======

DRBD
----

.. code-block:: bash

  ### CONFIGURATION
  # After deploying DRBD through Ansible:
  # Initialize the metadata
  drbdadm create-md data

  # Start the resource
  drbdadm up data

  # Set primary or standby
  drbdadm primary --force data
  drbdadm secondary --force data

  mkfs.ext3 /dev/drbd1
  mount /dev/drbd1 /mnt/data

  # Upgrade to DRBD v9
  sudo add-apt-repository ppa:linbit/linbit-drbd9-stack
  sudo apt update -y && sudo apt upgrade -y


  ### AFTER REBOOT / POWER FAILURE
  # Dont panic your data is in /dev/drbd1, just need to mount it
  sudo drbdadm up data

  # on primary only
  sudo drbdadm primary --force data

  # Mount drbd1 (where the data is!)
  sudo mount /dev/drbd1 /mnt/data

  # Start docker container from compose
  cd /etc/docker/owncloud/
  sudo docker-compose up -d

  # Restart deluge container to see the data again
  sudo docker restart deluge

ZFS
---

.. code-block:: bash

  # Install ZFS
  sudo apt install zfsutils-linux

  # Check which disks to use
  fdisk -l

  # Create the pool (data will be wiped!)
  sudo zpool create tank /dev/sdb /dev/sdc

  # Check Status
  sudo zpool status

  # Create ZFS Volume in pool or tank
  sudo zfs create -V 3486gb tank/vol


GlusterFS
---------

.. code-block:: bash

  # Install GlusterFS
  apt install glusterfs-server -y

  # Add servers to hosts file (to not rely on DNS)
  nano /etc/hosts

  # Create Gluster Volume
  gluster volume create gv0 server:/data server2:/data force

  # Start Gluster Volume
  gluster volume start gv0
