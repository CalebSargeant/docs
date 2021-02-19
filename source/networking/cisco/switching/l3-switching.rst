L3 Switching
============

The Problem:

Clients need routing between VLANs

Router on a stick (802.1Q/ISL)
------------------------------

- Advantages:

  - Simple to set up
  - Lower cost

- Disadvantages:

  - Congestion on a link
  - Single point of failure
  - Delay of routing

- Setup:

  - (Switch) configure trunk
  - (Router) create sub-interfaces

.. code-block:: none

  int f0/1
  switchport trunk encap dot1q
  switchport mode trunk
  int f0/0.10
  encap dot1q 10
  ip address 10.1.10.1 255.255.255.0
  int f0/0.20
  encap dot1q 20
  ip add 10.1.20.1 255.255.255.0

Multi-Layer Switching
---------------------

- Advantages:

  - Routing at wire speed
  - Backplane bandwidth
  - Redundancy-enabled

- Disadvantages:

  - Cost

- Setup:

  - Create SVIs
  - (opt.) create routed ports
  - (opt.) enable routing protocols

.. code-block:: none

  ip routing
  interface vlan 10
  ip add 10.1.10.1 255.255.255.0
  no shut
  interface vlan 20
  ip add 10.1.20.1 255.255.255.0
  no shut
  int fa0/24
  no switchport
  ip add 10.1.24.1 255.255.255.252

Understanding Layer 3 vs Multilayer Switching
---------------------------------------------

- First packet hits router, all future packets go through CEF/ASIC
- L3 Switch is a switch with router inside
- Multilayer is a switch that can cache routing info (CEF)
- All L3 switches are multilayer switches
- But not all multilayer switches are L3

Layer 3 Routing vs Layer 3 Switching
------------------------------------

- Router and L3 switch both have IOS software routing
- Software routing is relatively slow compared to ASICs
- L3 switches can play a little software - hardware trick

Exceptions to CEF
-----------------

- Packet with header options
- Packet with TTL expired
- Packets destined to a tunnel interface
- Packets with unsupported encapsulations
- Packets requiring fragmentation (MTU exceeded)

Verifying CEF Processing
------------------------

.. code-block:: none

  ip cef
  show ip cef summary
  show ip cef vlan 200
  sh ip arp 172.30.100.11
