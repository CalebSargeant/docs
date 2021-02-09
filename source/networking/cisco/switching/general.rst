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

Isolating Guest Network
-----------------------

The below configuration is applied on the Core Switch(es) in to block the guest network (VLAN100) from accessing the rest of the networks.

.. code-block:: none

  ip access-list extended VLAN100
    permit udp any eq bootpc host 10.10.10.10 eq bootps
    permit udp any eq bootpc host 10.10.10.11 eq bootps
    permit udp any any eq domain
    permit tcp any host 10.10.10.12 eq 8880
    deny ip any 10.0.0.0 0.255.255.255
    deny ip any 172.16.0.0 0.15.255.255
    deny ip any 192.168.0.0 0.0.255.255
    deny ip any 169.254.0.0 0.0.255.255
    permit ip any any

  interface Vlan100
    ip access-group VLAN100 in
