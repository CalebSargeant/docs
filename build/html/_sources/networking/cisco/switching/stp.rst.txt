STP
===

STP - Foundation per-VLAN Spanning Tree Concepts
------------------------------------------------

.. 5 - STP - Foundation per-VLAN Spanning Tree Concepts

* Switches forward broadcast packets out all ports by design
* Redundant connections are necessary in business networks
* The place of spanning tree: drop trees on redundant links (until they are needed)

The Facts About Spanning Tree
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* Original STP (802.1D) was created to prevent loops
* Switches send "probes" into the network called Bridge Protocol Data Units (BPDUs) to discover loops
* The BPDU probes also help elect the core switch of the network, called the Root Bridge
* The simplistic view of STP: all switches find the best way to reach the root bridge than block all redundant links

Understanding BPDUs and Elections
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* BPDUs are sent once every two seconds

  * Priority and Mac address in the packet

* Priority is some value between 0 and 61440 (default is 32768); increments of 4096 - lower is better
* Three port types

  * Root Port: used to reach the root bridge
  * Designated Port: forwarding port, one per link
  * Blocking / Non-designated port: where the tree fell

How STP Finds the Best Path
^^^^^^^^^^^^^^^^^^^^^^^^^^^

1. Elect the root
2. Switches find lowest cost path to port
3. Use lower bridge ID on equal paths
4. Use lower port to break a tie

.. csv-table::
   :header: "Link Bandwidth", "STP Cost"
   :widths: 20, 20

   "4Mbps", 250
   "10Mbps", 100
   "16Mbps", 62
   "45Mbps", 39
   "100Mbps", 19
   "155Mbps", 14
   "622Mbps", 6
   "1Gbps", 4
   "10Gbps", 2

Initial Enhancements: Per VLAN Spanning Tree
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* One root bridge elected for each VLAN
* Helps load-balance more effectively.

The Spanning-Tree Command
^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  Switch(config)#spanning-tree vlan x root primary
  Switch(config)#spanning-tree vlan x root secondary
  Switch(config)#spanning-tree vlan x priority <number>

Problems with Spanning-Tree
^^^^^^^^^^^^^^^^^^^^^^^^^^^

* Listening

  * 15 seconds of listening for BPDUs
  * Switch sends / receives BPDUs

* Learning

  * 15 seconds of learning MAC addresses
  * Populates CAM table

* Forwarding

  * Port is forwarding traffic (happy)

* Blocking

  * BONUS - switch will wait up to 20 seconds (max-age) before moving a blocked port into a listening phase.

Rapid Spanning Tree Concepts and Configuration
----------------------------------------------

Problems and Solutions
^^^^^^^^^^^^^^^^^^^^^^

* Problems with PCs: Modern PCs can boot faster than 30sec
* Solution: Portfast (``spanning-tree portfast``)
* Problems with Uplink Ports: 50 sec of down time causes big problems
* Solution: Rapid Spanning-Tree

  * 802.1w
  * Proactive System
  * Redefined Port Roles
  * Many STP Similarities

Rapid STP Port States
^^^^^^^^^^^^^^^^^^^^^

* Discarding
* Learning
* Forwarding

Rapid STP Port Roles
^^^^^^^^^^^^^^^^^^^^

* Root Port
* Designated Port
* Alternate Port
* Edge Port

Why RSTP is Better
^^^^^^^^^^^^^^^^^^

#. Because it doesnt forget ports
#. Because of the proactive nature, many "safety timers" of STP are eliminated
#. Any change to trunk ports flood through the network to other switches (TC packets)
#. Because the name says "rapid"

Configuring RSTP
^^^^^^^^^^^^^^^^

.. code-block:: none

  spanning-tree mode rapid-pvst
  int g0/0
  spanning-tree portfast
  show spanning-tree
