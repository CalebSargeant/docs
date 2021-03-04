IP vs. IFCONFIG
===============

.. code-block:: bash

  # Deprecated
  ifconfig
  ifconfig enp0s8
  man ifconfig

  # To be used:
  ip addr
  ip route
  ip neigh
  ip netns

  sudo ip netns add development
  ip netns

