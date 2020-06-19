VIRL
====

GUI client for VIRL: http://virl.cisco.com/intro.vmm.php
CLI client for VIRL: https://github.com/CiscoDevNet/virlutils

.. code-block:: bash

  # Install VirlUtils
  pip install virlutils

  # Get a list of commands
  virl --help

  # show list of VIRL topologies that can be downloaded
  virl search

  # Create a virl topology from template (virl down to turn off)
  virl up virlfiles/5_router_mesh

  # List running topologies
  virl ls

  # VIRL node list
  virl nodes

  # Console into a device
  virl console iosv-5

  # SSH into a device
  virl ssh iosv-1

  # Telnet into a device, etc, etc.
  virl telet iosv-2

  # .virlrc contains the virl configuration. This can be in ~/ or in the working dir. Example:
  VIRL_HOST=10.10.20.160
  VIRL_USERNAME=guest
  VIRL_PASSWORD=guest

  # Generate ansible inventory file
  virl generate ansible
 
