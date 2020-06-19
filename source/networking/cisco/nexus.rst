Nexus
=====

* IOSxe https://en.wikipedia.org/wiki/Cisco_IOS_XE (e.g. 3850) for campus.
* NXOS https://en.wikipedia.org/wiki/Cisco_NX-OS (3000 & 9000) for datacentre.
* IOS XR https://en.wikipedia.org/wiki/Cisco_IOS_XR (e.g. ASR9000, Network Converging System (NCS)).

API
---

* NX-API is CLI with a set of APIs that allow you to send CLI commands over http. It includes json-rpc, xml, and json message formats. This is not a RESTAPI, it's a different method.
* NX-API REST (3000s, 9000s, & newer only) is not designed as a CLI based API. It's designed as a true REST API that targets specific objects (such as an interface or vlan).
* Show the features, to see if API is enabled. Note that enabling features uses resources, so only enable what you are going to use.

.. code-block:: none

  sbx-n9kv# sh run | i feature
  feature nxapi
  feature bash-shell
  feature scp-server
  feature ospf
  feature bgp
  feature netconf
  feature restconf
  feature grpc
  feature interface-vlan
  !etc., etc.

JSON-RPC
^^^^^^^^

The command ``show vlan brief`` would appear as the below *API Request*. The *API Response* we get back is in JSON format with a body and table key, which we can process in our JQ code. JSONRPC is a generic way of communicating with the device and has less features. Use XML or JSON (below) instead.

* **jsonrpc** is a standard (or type of) API messaging format, which is a way to send RPC messages from a client to a device. Remote Procedure Calls (RPC) is a programming term for a system to ask a remote system to do something (procedure) and give me the result of the data.
* **method** in this case, is a cli block of data.
* **params** contains the command we want to send to the device. Jsonrpc specification requires one to input the **version** and in this case it is version 1.
* **id** is how the RPCs are linked back and forth.

.. code-block:: json

  [
    {
      "jsonrpc": "2.0",
      "method": "cli",
      "params": {
        "cmd": "show vlan brief",
        "version": 1
      },
      "id": 1
    }
  ]

XML & JSON
^^^^^^^^^^

* **ins_api** Cisco proprietary API. Designed to allow CLI commands through API, with error messaging, etc.
* **type** is *cli_show*. You also get *cli_show_ascii* (already written code to parse), *cli_conf* (sending configuration commands, automatic `conf t` mode) and *bash*.

**XML:**

.. code-block:: xml

  <?xml version="1.0"?>
  <ins_api>
    <version>1.0</version>
    <type>cli_show</type>
    <chunk>0</chunk>
    <sid>sid</sid>
    <input>show vlan brief</input>
    <output_format>xml</output_format>
  </ins_api>

**JSON:**

.. code-block:: json

  {
    "ins_api": {
      "version": "1.0",
      "type": "cli_show",
      "chunk": "0",
      "sid": "1",
      "input": "show vlan brief",
      "output_format": "json"
    }
  }

Visore
------

* Accessed via **https://<APIC or Switch IP Address>/visore.html**, visore is a REST API browser tool. It is built to mimic the ACI model.
* Similar to any RESTAPI, objects are targeted with a unique name. With NXAPI it's the DN (Distinguished Name).
* As an example, searching for L2BD (Layer 2 Bridge Domain) will result in showing all your VLANs.

Equivalent in Postman, running a GET **https://{{host}}/api/node/mo/sys/bd/bd-[vlan-3001].json** will output the device's VLAN (3001) drilling-down the tree from *sys* to *bd*.

In Postman, running a PUT **https://{{host}}/api/node/mo/sys/bd/bd-[vlan-3001].json** with the below body will update the name of VLAN 3001.

.. code-block:: json

  {
    "L2BD": {
      "attributes": {
        "name": "Update_VLAN"
      }
    }
  }

Bash
----

Bash on Nexus is the actual linux system that hosts NX-OS, whereas guestshell is a native, isolated container that cannot affect the host. You can also run docker containers (alpine, etc.) on Nexus to be able to run edge-processing applications and systems.
A good use case of running a docker container on the edge switch is to have it do a health check when config is changed and roll back the config if certain health check fails. This is useful for when your management system cannot access the switch due to said change.

.. code-block:: bash

  sbx-n9kv# run bash
  bash-4.3$

  # show all interfaces
  bash-4.3$ ip link

  # show ip addresses
  bash-4.3$ ip addr show dev Vlan101

  # go into root
  bash-4.3$ sudo su -

  # run a docker container
  root@sbx-n9kv#docker run alpine
