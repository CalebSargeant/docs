#######
NETCONF
#######

NETCONF/YANG are kind of like SNMPv4 (but not really) - it's nextgen style of reading device. MIBs are too crazy to read.

NETCONF runs over SSH and is XML under the hood. RESTCONF is over HTTP(s) via RESTAPI and headers and things. Both use YANG models. When a device supports both it comes down to personal preference. RESTCONF is used if you prefer RESTAPI. RESTCONF is simpler to use. NETCONF is the fist and oldest protocol. Dont waste time on draft RESTCONF. Very advanced things can only be done on NETCONF. RESTCONF is the future, but we must learn both. NETCONF runs on TCP-830


``ssh -oHostKeyAlgorithms=+ssh-dss root@ios-xe-mgmt.cisco.com -p 10000 -s netconf``

netconf will say hello and give you its capabilities
paste in your capability text
netconf session will be established after completing hello handshake
you can now ask or configure the device things over NETCONF XML

Using interactive python to interact with device with NETCONF (``pip3 install ncclient``)

.. code-block:: python

  ipython
  from ncclient import manager
  from demo import iosxeao
  iosxeao
    {'address': 'ios-xe-mgmt.cisco.com',
     'netconf_port': 10000,
     'restconf_port': 9443,
     'username': 'root',
     'password': 'D_Vay!_10&'}
  iosxe_manager = manager.connect(
    host = iosxeao["address"],
    port = iosxeao["netconf_port"],
    username = iosxe["username"],
    password = iosxe["password"],
    hostkey_verify = False)

  # find type of management
  type(iosxe_manager)
  ncclient.manager.Manager

  # are we connected
  iosxe_manager.connected
  True

  # show manager capabilities
  ioxe_manager.server_capabilities
  <dict_keyiterator object at 0x10b7139f8

  # run for loop for all capabilities
  for capability in iosxe_manager.server_capabilities:
      print(capability)

  # you can "get" in netconf to retrieve device details, or you can use "get config" to retrieve configuration details of the device. A filter can be created to retrieve specific details of config, for example, get the config of int g0/3 using python string:
  filter_GigabitEthernet3 = """
  <filter>
    <interfaces xmlns="urn:ietf:params:xml:ns:yang:ietf-interfaces">
      <interface>
        <name>GigabitEthernet3</name>
      </interface>
    </interfaces>
  </filter>
  """

  # Send get config with NETCONF from running-config
  iosxe_GigabitEthernet3 = iosxe_manager.get_config("running", filter_GigabitEthernet3)

  # run python type and get a GetReply from NETCONF
  type(iosxe_GigabitEthernet3)

  # run status code to see if NETCONF query successful
  iosxe_GigabitEthernet3.ok
  True

  # Import XML python library
  from xml.dom import minidom

  # Take and process returned XML
  iosxe_config_xml = minidom.parseString(iosxe_GigabitEthernet3.xml)

  # Print out the XML output
  print(iosxe_config_xml.toprettyxml(indent = "  "))
  # the requested device config will print out in XML format

  # Grab the xml and create a dictionary object in python
  import xmltodict
  iosxe_gig3_dict = xmltodict.parse(iosxe_GigabitEthernet3.xml)

  # Find the information in an order
  iosxe_gig3_dict["rpc-reply"]["data"]

  # Create that output as an object
  intf = iosxe_gig3_dict["rpc-reply"]["data"]

  # show the keys of the rpc-reply
  intf.keys()
  object_keys(['interfaces'])

  # show the interfaces and dive into interface key and get the name
  intf["interfaces"]["interface"]["name"]
  OrderedDict([('@xmlns:nc', 'urn:ietf:params:xml:ns:netconf:base:1.0'),
               ('#text', 'GigabitEthernet3')])

  # Get the enabled status of interface gig0/3
  intf["interfaces"]["interface"]["enabled"]
  'true'

  # Create loopback interface / send config to device
  create_loopback = """
  <config>
    <interfaces xmlns="urn:ietf:params:xml:ns:yang:ietf-interfaces">
      <interface>
        <name>Loopback1024</name>
        <description>Caleb's Loopback</description>
        <type xmlns:ianaift="urn:ietf:params:xml:ns:yang:iana-if-type">
          ianaift:softwareLoopback
        </type>
        <enabled>true</enabled>
        <ipv4 xmlns="urn:ietf:params:xml:ns:yang:ietf-ip">
          <address>
            <ip>172.31.231.231</ip>
            <netmask>255.255.255.0</netmask>
          </address>
        </ipv4>
      </interface>
    </interfaces>
  </config>
  """

  # send the config to the device through edit_config
  iosxe_create_loopback = iosxe_manager.edit_config(target = "running", config = create_loopback)

  # check status of sent config
  iosxe_create_loopback.ok
  'true'

  # Create a filter for loopback
  filter_loopback = """
  <filter>
    <interfaces xmlns="urn:ietf:params:xml:ns:yang:ietf-interfaces">
      <interface>
        <name>Loopback1024</name>
      </interface>
    </interfaces>
  </filter>
  """

  # show running config using filter
  iosxe_loopback = iosxe_manager.get_config("running", filter_loopback)
  iosxe_config_xml = minidom.parseString(iosxe_loopback.xml)
  print(iosxe_config_xml.toprettyxml(indent = "  "))
  # the config will print

  # To remove config - note the interface operation is now delete, not the default create/merge
  delete_loopback = """
  <config>
    <interfaces xmlns="urn:ietf:params:xml:ns:yang:ietf-interfaces">
      <interface operation="delete">
        <name>Loopback1024</name>
      </interface>
    </interfaces>
  </config>
  """

  # Create another edit_config
  iosxe_delete_loopback = iosxe_manager.edit_config(target = "running", config = delete_loopback)

  # Check if ran sucessfully
  iosxe_delete_loopback.ok
  'true'
