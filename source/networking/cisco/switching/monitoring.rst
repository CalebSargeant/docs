Monitoring
==========

Implementing Syslog
-------------------

- Your switch can store syslog messages locally
- Syslog uses UDP port 514

.. code-block:: none

  lin con 0
  logging synchronous
  logging 172.30.100.30
  logging trap debugging

Understanding SNMP
------------------

- SNMP "simply" grabs statistics from devices
- Monitoring applications manipulate and message data
- Three SNMP versions

.. code-block:: none

  snmp-server community $up3r$ecr3t ro
  access-list 10 permit 172.30.100.30 0.0.0.0
  snmp-server community $up3r$ecr3t ro 10
  do sh run | i snmp

Understanding IP SLA
--------------------

- A way of detecting link failure using real time data
- A way of testing service levels on a line
- A way to add valuable data to network monitoring
- A way to impress your friends
- SLA endpoint can be either a device or ip sla responder

.. code-block:: none

  ip sla 100
  icmp-ech 4.2.2.2
  frequency 5
  ip sla schedule 100 start-time now life forever
  track 1 rtr 100 reachability
  sh ip sla statistics
  ip route 0.0.0.0 0.0.0.0 216.22.345.122 track 100
