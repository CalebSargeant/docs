VLANs
=====

Configuration and Verification
------------------------------

.. 2. VLANs - Configuration and Verification

VLAN Foundations
^^^^^^^^^^^^^^^^

* Logically groups users
* Segments broadcast domains
* Subnet correlation
* Access control
* Quality of service

Local VLANs
^^^^^^^^^^^

* Local VLANs do not extend beyond the distribution layer
* Local VLAN traffic routed to other destinations
* Should be created around physical boundries

Configuring VLANs
^^^^^^^^^^^^^^^^^

.. code-block:: none

  conf t
  vlan 200
  name MARKETTING
  int r f0/0-10
  switchport mode access
  switchport access vlan 100

Deleting VLAN Database
^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  wr e
  del flash:vlan.dat

In-Depth Trunking
-----------------

.. 3. VLANs - In-Depth Trunking

Trunking
^^^^^^^^

* Trunking (aka tagging) passes multi-vlan information between switches
* Places VLAN information into each frame
* Layer 2 feature

The Two Tagging Flavours
^^^^^^^^^^^^^^^^^^^^^^^^

* Inter-Switch Link (ISL)

  * CISCO proprietary
  * Encapsulates the entire frame
  * Being phased out

* 802.1Q

  * Open standard/industry standard
  * Inserts tag into frame rather than encapsulation

Digging Deeper Into the Trunk
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* ISL

  * 26 byte header (Junk, VLAN, Junk)
  * Ethernet Frame
  * 4 byte CRC

* 802.1Q

  * Destination MAC
  * Source MAC
  * 4 byte tag (3 bit PRI, VLAN)
  * Ethernet Frame
  * FCS

Negotiating Trunking
^^^^^^^^^^^^^^^^^^^^

* Switches can auto-negotiate trunk connections using Dynamic Trunking Protocol (DTP)
* Can be confusing...
* Five different modes:

  * Access
  * Trunk
  * Dynamic Auto
  * Dynamic desirable
  * Non-negotiate

Configuring Trunk Ports
^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  int fa0/15
  switchport trunk encap dot1q
  switchport mode trunk
  ! must do this everywhere:
  switchport nonegotiate
  switchport trunk native vlan 10
  switchport trunk allowed vlan x y z

VLAN Trunking Protocol
----------------------

.. 4. VLANs - VLAN Trunking Protocol

VTP Modes
^^^^^^^^^

* Server (default)

  * Power to change vlan information
  * Sends and receives vtp updates
  * Saves vlan configuration

* Client

  * Cannot change vlan information
  * Sends and receives vtp updates
  * Does not save vlan configuration

* Transparent

  * Power to change vlan information
  * Forwards (passes through) vtp updates - vtp v2
  * Does not listen to vtp advertisements
  * Saves vlan configuration

VTP Pruning
^^^^^^^^^^^

* Keeps unnecessary broadcast traffic from crossing trunk links
* Only works on vtp servers

Configuring VTP
^^^^^^^^^^^^^^^

1. Verify current VTP status
2. Configure VTP domain/password
3. Configure VTP mode
4. Set VTP version number
5. Verify

.. code-block:: none

  sh vtp status
  vtp domain calebsargeant.com
  vtp mode
  vtp version 2

Common VLAN problems
^^^^^^^^^^^^^^^^^^^^

* Native VLAN mismatch
* Trunk negotiation issues

  * Auto-to-auto does not become trunk
  * If possible, avoid DTP (trunk nonegotiate)

* VTP updates not applying

  * Verify vtp domain/password
  * Verify vtp version
  * Verify trunk links
  * Delete flash:lvlan.dat and reboot
