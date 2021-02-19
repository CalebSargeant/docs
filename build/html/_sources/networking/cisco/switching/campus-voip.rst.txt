Campus VoIP
===========

Why an Organization Would use IPT
---------------------------------

Trackable Cost Savings:

- Moves, Adds, and changes (Macs)
- Bandwidth and equipment efficiency
- Lower cost of voice transmission
- New applications and devices

Phase One IP Telephony Migration
--------------------------------

- Keep the PBX system and digital phones
- Calls routed over WAN rather than PSTN

  - Major benefit: Free LD
  - Major requirement: QoS

Phase Two IP Telephony Migration
--------------------------------

- Voice and Data network have become one
- PBX and Digital phones for sale on E-Bay
- True integration between voice and data
- Typically new structures start here

Campus Issues to Power when Deploying VOIP
------------------------------------------

- Inline Power
- Dual VLANs
- QoS

Understanding and Configuring Dual VLANs
----------------------------------------

.. code-block:: none

  switchport mode access
  switchport access vlan 200
  switchport voice vlan 100

Understanding and Configuring QoS
---------------------------------

- Two QoS markings:

  - Class of service (CoS): layer 2
  - Type of service (ToS): layer 3

.. code-block:: none

  mls qos trust cos
  mls qos trust device cisco-phone
  auto qos voip trust
  no auto qos voip cisco-phone
