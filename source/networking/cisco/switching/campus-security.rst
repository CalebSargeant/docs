Campus Security
===============

Basic Port Security and 802.1x
------------------------------

Port Security on Catalyst Switches
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Prevents many layer 2 attacks
- Can use secure MAC Addresses

  - Dynamic
  - Static
  - Sticky

- Limits the number of MAC Addresses per port

.. code-block:: none

  int f0/21
  switchport mode access
  switchport port-security
  switchport port-security max 1
  switchport port-security violation restrict
  errdisable recovery cause security-violation
  switchport port-security mac-address sticky x

Identity-Based Network Services (IBNS)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  aaa new-model
  aaa authentication dot1x default group radius
  dot1x system-auth-control
  int f0/1
  dot1x port-control auto

VLAN and Spoofing Attacks
-------------------------

Preventing VLAN Hopping Attacks
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- VLAN Hopping: Hacker negotiates a trunk connection with a switch, moves between vlans
- Simple, yet easily forgotten prevention

.. code-block:: none

  switchport mode access

Private VLANs
^^^^^^^^^^^^^

- Promiscuous
- Isolated
- Community

Setting up Private VLANs
^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  vtp mode transparent
  vlan 200
  private-vlan primary
  vlan 205
  private-vlan community
  vlan 210
  private-vlan isoated
  vlan 200 private-vlan association 205,210
  show vlan private-vlan type
  int f0/24
  switchport mode private-vlan
  switchport mode private-vlan host
  switchport private-vlan host-association 200 205
  int f0/26
  switchport mode private-vlan host
  switchport private-vlan host-association 200 210
  int f0/27
  switchport mode private-vlan promiscuous
  switchport private-vlan mapping 200 205,210
  sh vlan private-vlan

Man in the Middle Attacks
^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  ip dhcp snooping
  int f0/23
  ip dhcp snooping trust
  sh ip dhcp snoop bind

STP Attacks and Other Security Considerations
---------------------------------------------

Spanning Tree Manipulation
^^^^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: none

  int f0/1
  spanning-tree bpduguard enable
  do sh int f0/1
  # stop switches from becoming root
  spanning-tree guard root

Cisco Switches Best Practices
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

#. Disable CDP wherever possible (``no cdp enable``)
#. Lock down spanning-tree (``switchport host`` and ``bpduguard``)
#. disable trunk negotiation on access ports (``sw mo acc``)
#. Physical security is key
#. Place unused ports in a black-hole vlan (``lin vty 0 4``, ``trans in ssh``)
#. Use SSH when possible

VACLs
-----

The Switch ACL: VACLs
^^^^^^^^^^^^^^^^^^^^^

- Allows you to filter traffic on VLAN
- Supported on MLS only
- Typically found in larger environments

.. code-block:: none

  # VACL
  access-list 1 permit 10.1.10.0
  mac access-list extended SERVER
  permit any host 1111.1111.2222
  access-list 2 perit 10.1.30.0 0.0.0.255
  vlan access-map DEMO 10
  match ip add 1
  action forward
  vlan access-map DEMO 20
  action drop
  vlan filter DEMO vlan-list 10
  vlan access-map DEMO1 10
  match ip add 2
  action forward
  vlan access-map DEMO1 20
  action drop
  vlan filter DEMO1 vlan-list 30

  # PACL
  # use ACLs from above then:
  int f0/1
  ip access-group 1 in
  mac access-group adsf in
