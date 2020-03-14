Networking
==========

IPTables
--------

Creating & Deleting Rules
-------------------------

**Create**

.. code-block:: bash

  iptables -A INPUT -i eth0 -p tcp --dport 80 -j ACCEPT
  iptables -A INPUT -i eth0 -p tcp --dport 443 -j ACCEPT

**Delete**

.. code-block:: bash

  iptables -D INPUT -i eth0 -p tcp --dport 80 -j ACCEPT
  iptables -D INPUT -i eth0 -p tcp --dport 443 -j ACCEPT

List & Delete Rules
-------------------

.. code-block:: bash

  # List the rules
  iptables -L INPUT --line-numbers

  # Delete rule 2 for example
  iptables -D INPUT 2

  # Specify a table
  iptables -t nat -D PREROUTING 1

LACP
----

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

Netcat
------

.. code-block:: bash

  # Check RADIUS UDP 1812 Port Status
  nc -vnzu 10.11.12.13 1812

Dig
---

A & CNAME: ``dig @dnsserver.example.com +short domain.com``
NS: ``dig @dnsserver.example.com +short NS domain.com``
MX: ``dig @dnsserver.example.com +short MX domain.com``
PTR: ``dig @dnsserver.example.com +short -x 10.11.12.13``

Public IP
^^^^^^^^^

Use ``208.67.222.222`` instead of resolver1 if no DNS.
``dig +short myip.opendns.com @resolver1.opendns.com``

Change Hostname
---------------

.. code-block:: bash

  sudo hostnamectl set-hostname <newhostname>
  sudo nano /etc/hosts

Netplan
-------

Static vs dynamic IP Address configuration.

``sudo nano /etc/netplan``

.. code-block:: yaml

  # DYNAMIC (defaults)
  network:
      version: 2
      ethernets:
          eth0:
              dhcp4: true
              match:
                  macaddress: xx:xx:xx:xx:xx:xx
              set-name: eth0

  # STATIC
  network:
      ethernets:
          eth0:
              addresses:
              - 10.0.2.3/24
              gateway4: 10.0.2.1
              nameservers:
                  addresses:
                  - 10.0.2.1
                  search:
                  - example.com
      version: 2

Ubuntu 16 - Change IP & Hostname
--------------------------------

**Static IP**

.. code-block:: bash

  cd /etc/sysconfig/network-scripts/
  vi ifcfg-eth0
    DEVICE=eth0
    BOOTPROTO=none
    ONBOOT=yes
    NETMASK=xxx.xxx.xxx.xxx
    IPADDR=xxx.xxx.xxx.xxx
    TYPE=Ethernet
  vi /etc/sysconfig/network
    NETWORKING=yes
    NETWORKING_IPV6=no
    HOSTNAME=hostname.domainname.co.za
    GATEWAY=xxx.xxx.xxx.xxx

  /etc/init.d/network restart

**Dynamic IP**

``dhclient ethx`` or:

.. code-block:: bash

  cd /etc/sysconfig/network-scripts/
  vi ifcfg-eth0
    DEVICE=eth0
    BOOTPROTO=dhcp
    ONBOOT=yes
    TYPE=Ethernet

  vi /etc/sysconfig/network
    NETWORKING=yes
    NETWORKING_IPV6=no
    HOSTNAME=hostname.domainname.co.za
    GATEWAY=xxx.xxx.xxx.xxx

  /etc/init.d/network restart

**Hostname Change**

.. code-block:: bash

    hostname --fqd
    vi /etc/sysconfig/network
      HOSTNAME=<new_hostname>
    vi /etc/hosts
      <ipaddr_of_server> <new_hostname.domain> <hostname>
    reboot
