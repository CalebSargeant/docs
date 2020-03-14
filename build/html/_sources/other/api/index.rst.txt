API
===

"Only use the CLI when you must" - use RESTCONF/NETCONF & YANG instead. You can use the API models cross-vendor, where CLI changes.

MIB is a structure model of information that we use with SNMP but OIDs are difficult to remember. With SNMP we get information about the MIB. NETCONF, RESTCONF, and YANG, work the same way. YANG is like a new-standard MIB, it's a way to define information about your devices/network. The way you get the information is to go over some sort of transport protocol. This is where NETCONF & RESTCONF come in - you can connect to device and ask it to send you information. The requested information is related to a YANG model.

.. toctree::
  :maxdepth: 1
  :glob:

  *
