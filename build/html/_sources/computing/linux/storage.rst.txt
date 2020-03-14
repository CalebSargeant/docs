Storage
=======

File System Check Loop
----------------------

You start up CentOS and it wants to do a File System check. You do the check, reboot and it happens again.
Try the following:

#. Put a CentOS disk into the DVD-Rom
#. Start Rescue Mode
#. Type the following commands:

.. code-block:: bash

  chroot /mnt/sysimage
  badblocks -sv /dev/sdax -o <file_name_here>
  e2fsck -t ext3 -l <file_name_here> /dev/sdax
  vi /etc/fstab
    comment out /dev/sdax before booting the server again

Formatting USB Flash Drive
--------------------------

* vFAT (FAT32): ``mkfs.vfat``
* NTFS: ``mkfs.ntfs``
* EXT4: ``mkfs.ext4``

.. code-block:: bash

  # Format
  mkfs.ext4 -L CALEB /dev/sdx

  # Show information about the USB flash
  parted /dev/sdx print

  # Mound the flash
  mount -t ext4 /dev/sdx1 /mnt/CALEB

Repairing Grub
--------------

You boot up Linux machine (CentOS) and only "grub _" displays on the screen. You can try:

#. Boot from Linux live CD/USB
#. Start in Rescue Mode
#. Run commands

.. code-block:: bash

  chroot /mnt/sysimage
  sbin/grub-install
  mount
  reboot

Mount
-----

.. code-block:: bash

  # install cifs-utils
  apt-get install cifs-utils

  # /etc/fstab
  //server/data /mnt/data cifs credentials=/root/.smbcredentials,vers=1.0,iocharset=utf8,sec=ntlm 0 0

  mount -a

Mount USB Flash Disk
--------------------

.. code-block:: bash

  # Create folder for mounting
  mkdir -p /media/USB

  # List /dev/
  ls /dev/

  # Insert Flash now, then list /dev/ again, if flash is sdb:
  mount -t vfat /dev/sdb1 /media/USB

  # List contents of /media/USB
  # If dir contains System Volume Information, you good
  # When you are done, to safely remove:
  umount /media/USB

iostat
------

.. code-block:: bash

  sudo apt-get install sysstat
  iostat -d 2 /dev/sda

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

Badblocks
---------

* You can use a Linux boot CD to repair a Windows NTFS disk fault.
* If no filesystems are specified on the command line, and the ``-A`` option is not specified, ``fsck`` will default to checking filesystems in the ``/etc/fstab`` serial.
* This can take several hours depending on the speed of your system and the size and speed of your disk.
* unmount the disk first using ``sudo fsck -pcfv /dev/sda``. This ``fsck`` command forces automatic bad block checking and it automatically marks all known bad sectors as bad too.
* If you're booting back into Linux, make sure that ``smartmontools`` is installed and enabled with ``sudo apt-get install smartmontools``.
* Enable "SMART" in your BIOS if it isn't already.
* Run an extended offline test with ``sudo smartctl --test=long /dev/sda``
* To see a nice overall view of system health: ``sudo smartctl -a /dev/sda``

Linux Harddrive
^^^^^^^^^^^^^^^

#. Put a CentOS disk into the DVD-Rom
#. Start Rescue Mode
#. Type the following commands:

.. code-block:: bash

  fdisk -l
  mkdir /mnt/boot
  mount /dev/hdb1 /mnt/boot
  df -h
  cd /mnt/boot
  badblocks -sv /dev/sdax -o <file_name_here>
  e2fsck -t ext3 -l <file_name_here> /dev/sdax


Windows Harddrive
^^^^^^^^^^^^^^^^^

.. warning::
  This is not a good idea!

#. Plug the ntfs disk into a Linux box
#. Boot off the Linux box
#. Type the following commands:

.. code-block:: bash

  yum install ntfs-3g ntfs-config ntfsprogs testdisk
  ln -s /usr/bin/ntfsfix /usr/sbin/fsck.ntfs
  ln -s /usr/bin/ntfsfix /usr/sbin/fsck.ntfs-3g
  fdisk -l
  mkdir /mnt/boot
  mount /dev/hdbx /mnt/boot
  df -h
  cd /mnt/boot
  badblocks -sv /dev/hdbx -o <file_name_here>
  e2fsck -t ext3 -l <file_name_here> /dev/hdbx
