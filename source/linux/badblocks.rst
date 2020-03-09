#########
Badblocks
#########

* You can use a Linux boot CD to repair a Windows NTFS disk fault.
* If no filesystems are specified on the command line, and the ``-A`` option is not specified, ``fsck`` will default to checking filesystems in the ``/etc/fstab`` serial.
* This can take several hours depending on the speed of your system and the size and speed of your disk.
* unmount the disk first using ``sudo fsck -pcfv /dev/sda``. This ``fsck`` command forces automatic bad block checking and it automatically marks all known bad sectors as bad too.
* If you're booting back into Linux, make sure that ``smartmontools`` is installed and enabled with ``sudo apt-get install smartmontools``.
* Enable "SMART" in your BIOS if it isn't already.
* Run an extended offline test with ``sudo smartctl --test=long /dev/sda``
* To see a nice overall view of system health: ``sudo smartctl -a /dev/sda``

Linux Harddrive
---------------

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
-----------------

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
