Mikrotik
========

First Time Setup
----------------

Securing the Router
^^^^^^^^^^^^^^^^^^^

- Disable wireless if not using it
- IP > Services (disable telnet and stuff, only allow certain addresses)

.. code-block:: bash

    ip service print

- System > Password (change the password)
- System > Users > double click on the user and set the allowed addresses

.. image:: _images/mikrotik-securing-1.png

Configuring the Bridge
^^^^^^^^^^^^^^^^^^^^^^

- IP > Addresses (giving the bridge an address that will be used as gateway)

.. image:: _images/mikrotik-bridge-1.png

Configuring the Outside Interface
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Disable ether1 in Bridge
- IP > DHCP Client

.. image:: _images/mikrotik-dhcp-client-1.png

Configuring DHCP Server for Clients
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- IP > DHCP Server > DHCP Setup
- DHCP Server Interface: bridgeLocal
- DHCP Address Space: 172.16.0.0/24
- Gateway for DHCP Network > 172.16.0.1
- DHCP Relay > delete this

Configure NAT
^^^^^^^^^^^^^

- IP > Firewall > NAT
- Chain: srcnat
- Action: masquerade

Deny Catch all Firewall Rules
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

.. image:: _images/mikrotik-firewall-1.png

Upgrading the Router
^^^^^^^^^^^^^^^^^^^^

- System > Packages > Check For Updates > Download&install

Upgrading the Firmware
^^^^^^^^^^^^^^^^^^^^^^

- System > RouterBOARD > Upgrade
- System > Reboot

Setting the Identity
^^^^^^^^^^^^^^^^^^^^

* System > Identity

.. code-block:: bash

    system identity set name=Caleb

Users & Groups & SSH Keys
-------------------------

- System > Users (here you can admin all your users nad groups, give read only access, etc.)
- For SSH keys upload your private key file that you generated
- Allow/Deny SSH password Login to disable/enable ssh key login only

.. code-block:: bash

    ip ssh set always-allow-password-login=no
    ip ssh print

HTTPS Access to Router
----------------------

- System > Certificates
- Country: ZA
- Key Size: 2048
- Days Valid: 365
- Key Usage: tls server
- Sign
- IP > Services > enable www-ssl and select the certificate

Backup and Restore
------------------

- Files > Backup

.. code-block:: bash
    
    system backup save encryption=aes-sha256 name=backup
    
    # or (takes a lot of load)
    export
    export file=export

- Files > Restore

.. code-block:: bash

    import file-name=export.rsc

    # or open the file with text editor and copy paste

Resetting Router
----------------

- Press the reset button until the light stops flashing by unplugging the power, holding the button and powering on
- System > Reset Configuration

Netinstall
----------

- Only works on ether1
- Formats the drive, keeps license key and RouterBOOT settings
- Download Netinstall from Mikrotik site and open it
- Click Net booting > boot server enabled > put in IP Address of router

Licensing
---------

- System > License
- https://wiki.mikrotik.com/wiki/Manual:License

DHCP
----

- Discover: broadcast takes place over network
- Offer: the server offers the client a lease
- Request: client requests the lease from the server
- Acknowledge: server sends client ack for the lease

IP > DHCP Server > DHCP Setup

ARP
---

- ARP Request: gets broadcast to find out who the ip address of the mac address is of the ip address
- Server puts the clients mac address and ip address in its arp table and replies to client
- Mikrotik recommends setting your interface arp to reply-only so that it doesnt learn new arps from anywhere else

IP > ARP

Bridging
--------

- Ports in a bridge behave as a switch at layer 2

Bridge

Station Mode
^^^^^^^^^^^^

- Interfaces > wlan1 > mode: station bridge
- Scan and select the WLAN you want to connect to
- this will allow one router to connect to the other one wirelessly: ISP <-> R1 <-> wifi <-> R2 <-> PC

Routing
-------

- Exterior Gateway Protocol (EGP):

    - BGP

- Interior Gateway Protocols (IGP):

    - RIP
    - IGRP (Cisco)
    - EIGRP (Cisco)
    - OSPF
    - IS-IS

IP > Routes

Tunneling / VPN
---------------

What is VPN?
^^^^^^^^^^^^

**Private WAN:**

- Secure
- Confidential
- But expensive

Alternative to private WAN is the internet. However, the internet is unsecure and we need a VPN protocol to run to have a secure data transfer from A to B

**VPN Features:**

- Confidentiality: preventing anyone from reading your data using encryption protocols
- Authentication: verifying that the router/firewall or remote user that is sending VPN traffic is a legitimate device or router
- Integrity: verifying that the VPN packet wasn't changed during transit
- Anty-replay: preventing someone from capturing traffic and resending it, trying to appear as a legitimate device/user

L2TP Ports and Protocols
^^^^^^^^^^^^^^^^^^^^^^^^

https://serverfault.com/questions/451381/which-ports-for-ipsec-lt2p

- Protocol: UDP, port 500 (for IKE, to manage encryption keys)
- Protocol: UDP, port 4500 (for IPSEC NAT-Traversal mode)
- Protocol: ESP, value 50 (for IPSEC)
- Protocol: AH, value 51 (for IPSEC)


