Genie
=====

Automatically parses device configuration into yaml, json, etc. to be used with python, for example.

https://developer.cisco.com/docs/genie-docs/

.. code-block:: bash

  # get a state of the network
  genie learn interface --testbed testbed.yaml --device iosxe --output learn

  # some stuff changes in the network

  # learn the network again
  genie learn interface --testbed testbed.yaml --device iosxe --output learn2

  # get a diff of the network to see what changed
  genie diff learn learn2 --output diff
