###########
HP Procurve
###########

Checking Health
---------------

Uptime: ``show ver``
Memory: ``show health``
CPU: ``show system processes brief``

Backing up Configs
------------------

Start the TFTP Server.

Run the command ``copy running-config tftp 10.10.0.81 SWITCH-NAME``

STP Configuration
-----------------

Configuring the Root Bridge:

.. code-block:: none

  Procurve 4204vl-1# configure
  Procurve 4204vl-1(config)# spanning-tree
  Procurve 4204vl-1(config)# spanning-tree priority 0
  Procurve 4204vl-1(config)# write memory

Configuring the other switches:

.. code-block:: none

  Procurve 4204vl-2# configure
  Procurve 4204vl-2(config)# spanning-tree
  Procurve 4204vl-2(config)# write memory
