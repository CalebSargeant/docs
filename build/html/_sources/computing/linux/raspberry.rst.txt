Raspberry Pi
============

All Raspberry Pi-related stuff.

Writing SD Card
---------------

https://www.raspberrypi.org/documentation/installation/installing-images/mac.md

.. code-block:: bash

  # List disks to find SD card disk number (diskN)
  diskutil list

  # Unmount the disk
  diskutil unmountDisk /dev/diskN

  # Write the image to SD card. Check the progress by pressing Ctrl+T.
  sudo dd bs=1m if=/Users/caleb/Downloads/raspberry.img of=/dev/rdiskN; sync

  # Eject the disk afterwards
  sudo diskutil eject /dev/rdiskN
