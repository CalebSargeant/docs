The Switch's Domain
===================

Understanding Loopguard
-----------------------

- Stops loops caused by unidirection link failures
- Example:

  - A is root bridge
  - Link between B and C is blocked (at B)
  - Link between B and C goes unidirectional
  - B releases the block, one-way loop occurs

- Loopguard should be enabled (per-port) on all switch uplinks

.. code-block:: none

  Switch(config-if)#spanning-tree guard loop
  Switch(Config)#spanning-tree loopguard default

Understanding UDLD
------------------

- Different from loopguard, but from the same goal
- Designed specifically for fiber
- Sends a "Layer 2 ping" between neighbors
- Supports normal and aggressive (preferred) mode
- Cisco recommends use both!

.. code-block:: none

  switch(config)#udld <enable/aggressive>
  switch(config-if)#udld port <aggressive>
  switch#udld reset

Supervisor Redundancy Mechanisms
--------------------------------

- Stateful Switchover (SSO)

  - Lightning quick failover between supervisor engines
  - Sync's startup, running, L2 (MAC) and L3 (FIB) tables, ACLs

- Cisco Non-Stop Forwarding (NSF)

  - Forwards traffic with CEF
  - Supports with EIGRP, OSPF, IS-IS, and BGP

Designing the Network
---------------------

- Use local VLANs
- Set up HSRP intuitively for active VLANs
- Match STP root to active HSRP gateway
