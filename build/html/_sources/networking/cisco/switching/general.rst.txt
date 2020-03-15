General
=======

.. 1. Switches Domain - Core Concepts and Design
Core Concepts and Design
------------------------

Plug and play switches
^^^^^^^^^^^^^^^^^^^^^^

* Chance for failure
* Broadcast traffic
* Multicast issues
* Security issues
* MAC flooding

Enterprise Composite Network Model
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* Access
* Distribution
* Core

VLANs
^^^^^

* Simpler Management
* Troubleshooting ease
* Better performance
* Mental sanity
* Summarization points

Designing the Network
^^^^^^^^^^^^^^^^^^^^^

* Restrict VLANs to switch blocks
* Implement management VLAN
* Separate voice traffic
* Implement multicast support

The Two Flavours of CISCO Switches
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* CISCO catalyst OS (CatOS)

  * Uses set-based syntax
  * Typically combined with IOS for layer 3 functions

* CISCO 'native' IOS

  * Similar to router configuration

* Typically, all larger switch models (such as cat 4500, 6500, etc...) run CatOS
* CISCO has a migration path for all mainline switches to the native IOS

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
