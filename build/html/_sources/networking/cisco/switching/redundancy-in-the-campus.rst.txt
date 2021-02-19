HSRP, VRRP, and GLBP
====================

Redundancy Considerations
-------------------------

- How fast can this happen?
- How does the client know?
- What about ARP cache issues?
- What if just the WAN link fails?


HSRP vs VRRP vs GLBP
--------------------

- Cisco Hot-Standby Router Protocol (HSRP):

  - Created by Cisco, for Cisco in 1994
  - Uses a default hello timer of 3 seconds with a hold timer of 10 seconds

- Virtual Router Redundancy Protocol (VRRP):

  - Created by the IETF in 1999
  - Works between multiple vendors
  - Has faster timers than HSRP by default - hello of 1 second, hold timer of 3 seconds

- Gateway Load Balancing Protocol (GLBP):

  - Created by Cisco, for Cisco in 2005
  - Identical features to HSRP, but allows active-active connection that adds load balancing

HSRP
----

- Gateways organised into standby groups
- One gateway active, others in standby state
- Phantom (virtual) router IP and MAC address generated
- Hello messages sent once every 3 seconds, dead after 10 sec

Mac Address Structure:

- 0000.0C07.ACXX
- 0000.0C - Cisco Vendor ID
- 07.AC - HSRP ID
- XX - Standby group number

HSRP Base Configuration
^^^^^^^^^^^^^^^^^^^^^^^

- Step 1: Create standby group
- Step 2: Reassign IP Addresses
- Step 3: Verify
- Step 4: optimize and tune

.. code-block:: none

  # Switch A
  int vlan 70
  standby 1 ip 172.30.70.1
  standby 1 priority 150

  # Switch B (default priority of 100)
  int vlan 70
  standby 1 ip 172.30.70.1
  standby 1 priority 100

  # Verify
  show standby

Tuning and Optimizing HSRP
^^^^^^^^^^^^^^^^^^^^^^^^^^

- Priority
- Preempt
- Tracking
- Timers

.. code-block:: none

  standby group 1 preempt
  standby 1 track f0/23 60
  standby 1 preempt delay reload 180
  standby 1 timers msec 150 msec 700

VRRP
----

- Active/standby becomes master/backup
- Standby group becomes VRRP group
- master router can share virtual IP
- One second hello timer, three times hello = down time (+ skew timer)

VRRP Configuration
^^^^^^^^^^^^^^^^^^

- Step 1: Configure VRRP Group
- Step 2: Optimize settings
- Step 3: Verify

.. code-block:: none

  # Master
  int f0/0
  vrrp 20 ip 172.30.4.90
  vrrp 20 preempt
  vrrp 20 timers advertise msec 100

  # Backup
  # same, except instead of advertise, learn

  # Verify
  show vrrp

GLBP
----

- Single VIP with Multiple MACs
- Active Virtual gateway (AVG) acts as the 'point man'
- Other routers act as active virtual forwarders (AVF)

GLBP Configuration
^^^^^^^^^^^^^^^^^^

.. code-block::

  # AVG
  int f0/0
  glbp 1 ip 172.30.4.70
  glbp 1 priority 150

  # AVF
  # get priority 100

  # other options
  glbp 1 load-balancing
  glbp 1 timers
  glbp 1 weighting

  # Verify
  show glbp
