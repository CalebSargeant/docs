####
LACP
####

Ubuntu
------

.. code-block:: bash

  sudo apt-get update -y && sudo apt-get upgrade -y
  sudo service networking stop
  sudo nano /etc/network/interfaces

  #/etc/network/interfaces
  auto lo
  iface lo inet loopback

  iface eno1 inet manual
  bond-master bond0

  iface eno2 inet manual
  bond-master bond0

  auto bond0
  iface bond0 inet manual
  bond-mode 4
  bond-miimon 100
  bond-lacp rate 1
  bond-slaves none

  auto br0
  iface br0 inet static
  address 10.0.0.253
  gateway 10.0.0.1
  netmask 255.255.255.0
  bridge-ports bond0
  bridge-stp off
  bridge-fd 0
  bridge-maxwait 0
  #

  sudo service networking start
