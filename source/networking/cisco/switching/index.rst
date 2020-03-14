Switching
=========

Health
------

* CPU: ``Sh proc cpu sorted | ex 0.00``

Factory Default Settings
------------------------

1. Hold down the mode button
2. Plug in console cable
3. Commands:

.. code-block:: none

  switch: flash_init
  switch: dir flash:
  switch: del flash:config.text
  del flash:vlan.dat
  boot

IOS Upgrade
-----------

1. Setup a TFTP server
2. Commands:

.. code-block:: none

  # Backup config
  copy run start

  # Backup config to server
  copy startup-config tftp:

  # Copy the .bin file downloaded to flash
  copy tftp flash:

  # Verify the .bin file
  verify flash:xxxx.bin

  # Specify to boot off of the new .bin file
  boot system flash:xxxxxxx.bin
  reload
