Etherchannel
============

Two Negotiating Protocols
-------------------------

* Port Aggregation Protocol (PAGP)

  * Cisco Proprietary
  * Port Modes: Auto, Desirable, On

* Link Aggregatrion Control Protocol (LACP)

  * Industry standard (802.3ad)
  * Port modes: passive, active, on

Configuring EtherChannel
------------------------

Layer 2 EtherChannel
^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  int r g0/23 - 24
  channel-protocol pagp
  channel-group 1 mode desireable

  show etherchannel 1 port

Layer 3 EtherChannel
^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  int r g0/23 -24
  no channel-group 1
  no switchport
  int port-channel 1
  no switchport
  ip address 10.1.1.1 255.255.255.0
  channel-group 1 mode desireable

Best Practices
--------------

* All ports must use same speed and duplex (hard code!)
* Interfaces in a bundle are redundant
* No interfaces in bundle can be span ports
* Interfaces in a bundle must be in same VLAN / trunk
* Any changes to port-channel affects all bundled ports
* Any changes to individual ports affect only that port
