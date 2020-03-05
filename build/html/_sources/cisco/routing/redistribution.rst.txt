##############
Redistribution
##############

Why One Would Use Multiple Protocols
------------------------------------

#. The politics of networking
#. Conversion between routing protocols
#. Vendor selection
#. Application/business requirements

Resolving Redistribution Issue
------------------------------

* Passive interfaces
* Administrative distance modification
* Distribute lists/prefix lists
* Route maps/route tagging

Redistribution Metrics
----------------------

* RIP - Infinite
* EIGRP - Infinite
* OSPF - 20
* BGP - keeps old metric

Basic Redistribution Configuration
----------------------------------

:download:`_docs/redistribution-basic-configuration.zip`

.. image:: _images/redistribution-basic-configuration.png
    :width: 744px
    :align: center
    :height: 206px

**Router R1**

.. code-block::

  R1(config)#router eigrp 100
  R1(config-router)#network 10.0.0.0
  R1(config-router)#no auto
  R1(config-router)#int s1/0
  R1(config-if)#ip add 10.1.12.1 255.255.255.0
  R1(config-if)#no shut
  R1(config-if)#int lo0
  R1(config-if)#ip add 10.1.0.1 255.255.255.0
  R1(config-if)#int lo1
  R1(config-if)#ip add 10.1.1.1 255.255.255.0
  R1(config-if)#int lo2
  R1(config-if)#ip add 10.1.2.1 255.255.255.0
  R1(config-if)#int lo3
  R1(config-if)#ip add 10.1.3.1 255.255.255.0
  R1(config-if)#int lo4
  R1(config-if)#ip add 10.1.4.1 255.255.255.0
  R1(config-if)#int lo5
  R1(config-if)#ip add 10.1.5.1 255.255.255.0
  R1(config-if)#int lo6
  R1(config-if)#ip add 10.1.6.1 255.255.255.0

**Router R2**

.. code-block::

  R2(config)#router eigrp 100
  R2(config-router)#no auto
  R2(config-router)#net 10.1.12.0 0.0.0.255
  R2(config-router)#int s1/0
  R2(config-if)#ip add 10.1.12.2 255.255.255.0
  R2(config-if)#no shut
  R2(config-if)#int s1/1
  R2(config-if)#ip add 10.1.23.2 255.255.255.0
  R2(config-if)#no shut
  R2(config-if)#router ospf 1
  R2(config-router)#net 10.1.23.0 0.0.0.255 area 0
  R2(config)#router ospf 1
  R2(config-router)#redistribute eigrp 100 subnets
  R2(config-router)#router eigrp 100
  R2(config-router)#redistribute ospf 1 metric 100 100 100 100 100
  R2(config-router)#access-list 1 permit 10.1.1.0 0.0.0.255
  R2(config)#access-list 1 permit 10.1.3.0 0.0.0.255
  R2(config)#access-list 1 permit 10.1.5.0 0.0.0.255
  R2(config)#router ospf 1
  R2(config-router)#distribute-list 1 out
  R2(config)#ip prefix-list CALEB permit
  R2(config)#ip prefix-list CALEB permit 10.0.0.0/8 le 24
  R2(config)#route-map FILTER_OSPF_TO_EIGRP
  R2(config-route-map)#match ip address prefix-list CALEB
  R2(config-route-map)#router eigrp 100
  R2(config-router)#redistribute ospf 1 metric 100 100 100 100 100 route-map FILTER_OSPF_TO_EIGRP

**Router R3**

.. code-block::

  R3(config)#router ospf 1
  R3(config-router)#net 10.0.0.0 0.255.255.255 area 0
  R3(config-router)#int s1/0
  R3(config-if)#ip add 10.1.23.3 255.255.255.0
  R3(config-if)#no shut
  R3(config-if)#int lo0
  R3(config-if)#ip add 10.1.7.1 255.255.255.0
  R3(config-if)#ip ospf network point-to-point
  R3(config-if)#int lo1
  R3(config-if)#ip add 10.1.8.1 255.255.255.0
  R3(config-if)#ip ospf network point-to-point
  R3(config-if)#int lo2
  R3(config-if)#ip add 10.1.9.1 255.255.255.0
  R3(config-if)#ip ospf network point-to-point
  R3(config-if)#int lo3
  R3(config-if)#ip add 10.1.10.1 255.255.255.0
  R3(config-if)#ip ospf network point-to-point
  R3(config-if)#int lo4
  R3(config-if)#ip add 10.1.11.1 255.255.255.0
  R3(config-if)#ip ospf network point-to-point
  R3(config-if)#int lo5
  R3(config-if)#ip add 10.1.12.1 255.255.255.252
  R3(config-if)#ip ospf network point-to-point
  R3(config-if)#int lo6
  R3(config-if)#ip add 10.1.12.1 255.255.255.252
  R3(config-if)#ip ospf network point-to-point
  R3(config-if)#int lo7
  R3(config-if)#ip add 10.1.12.9 255.255.255.252
  R3(config-if)#ip ospf network point-to-point

Advanced Redistribution Configuration
-------------------------------------

:download:`_docs/redistribution-advanced-configuration.zip`

.. image:: _images/redistribution-advanced-configuration.png
    :width: 562px
    :align: center
    :height: 447px

**Router R1**

.. code-block::

  R1(config)#int lo0
  R1(config-if)#ip add 10.1.0.1 255.255.255.0
  R1(config-if)#int s1/0
  R1(config-if)#ip add 10.1.12.1 255.255.255.0
  R1(config-if)#no shut
  R1(config-if)#int s1/1
  R1(config-if)#ip add 10.1.13.1 255.255.255.0
  R1(config-if)#no shut
  R1(config-if)#router ospf 1
  R1(config-router)#net 10.0.0.0 0.255.255.255 area 0
  R1(config-router)#end
  R1#wr

**Router R2**

.. code-block::

  R2(config)#int s1/0
  R2(config-if)#ip add 10.1.24.2 255.255.255.0
  R2(config-if)#no shut
  R2(config-if)#int s1/1
  R2(config-if)#ip add 10.1.23.2 255.255.255.0
  R2(config-if)#no shut
  R2(config-if)#int s1/2
  R2(config-if)#ip add 10.1.12.2 255.255.255.0
  R2(config-if)#no shut
  R2(config-if)#router ospf 1
  R2(config-router)#net 10.1.12.0 0.0.0.255 area 0
  R2(config-router)#router eigrp 100
  R2(config-router)#net 10.1.24.0 0.0.0.255
  R2(config-router)#no auto
  R2(config-router)#net 10.1.23.0 0.0.0.255
  R2(config)#access-list 1 permit 10.4.0.0 0.0.0.255
  R2(config)#access-list 1 permit 10.4.1.0 0.0.0.255
  R2(config)#access-list 2 permit 10.4.2.0 0.0.0.255
  R2(config)#access-list 2 permit 10.4.3.0 0.0.0.255
  R2(config)#access-list 3 permit 10.4.4.0 0.0.0.255
  R2(config)#route-map EIGRP-TO-OSPF
  R2(config-route-map)#match ip add 1
  R2(config-route-map)#set metric 100
  R2(config-route-map)#set tag 10
  R2(config)#route-map EIGRP-TO-OSPF permit 20
  R2(config-route-map)# match ip address 2
  R2(config-route-map)# set metric 200
  R2(config-route-map)# set tag 20
  R2(config-route-map)#route-map EIGRP-TO-OSPF deny 30
  R2(config-route-map)#match ip address 3
  R2(config-route-map)# set metric 300
  R2(config-route-map)# set tag 30
  R2(config-route-map)#route-map EIGRP-TO-OSPF permit 40
  R2(config-route-map)# set metric 300
  R2(config-route-map)# set tag 30
  R2(config-router)#redistribute eigrp 100 subnets route-map EIGRP-TO-OSPF
  R2(config)#route-map OSPF-TO-EIGRP
  R2(config-route-map)#set metric 400 20 255 1 1500
  R2(config-route-map)#set tag 40
  R2(config)#router eigrp 100
  R2(config-router)#redistribute ospf 1 route-map OSPF-TO-EIGRP
  R2(config)#route-map EIGRP-TO-OSPF deny 5
  R2(config-route-map)#match tag 40
  R2(config)#route-map OSPF-TO-EIGRP deny 5
  R2(config-route-map)#match tag 10 20 30
  R2(config)#router eigrp 100
  R2(config-router)#distance eigrp 90 105
  R2(config-router)#end
  R2#wr

**Router R3**

.. code-block::

  R3(config)#int s1/0
  R3(config-if)#ip add 10.1.13.3 255.255.255.0
  R3(config-if)#no shut
  R3(config-if)#int s1/1
  R3(config-if)#ip add 10.1.23.3 255.255.255.0
  R3(config-if)#no shut
  R3(config-if)#router ospf 1
  R3(config-router)#net 10.1.13.0 0.0.0.255 area 0
  R3(config-router)#router eigrp 100
  R3(config-router)#net 10.1.23.0 0.0.0.255
  R3(config-router)#no auto
  R3(config)#route-map EIGRP-TO-OSPF permit 10
  R3(config-route-map)# match ip address 1
  R3(config-route-map)# set metric 100
  R3(config-route-map)# set tag 10
  R3(config-route-map)#route-map EIGRP-TO-OSPF permit 20
  R3(config-route-map)# match ip address 2
  R3(config-route-map)# set metric 200
  R3(config-route-map)# set tag 20
  R3(config-route-map)#route-map EIGRP-TO-OSPF deny 30
  R3(config-route-map)# match ip address 3
  R3(config-route-map)# set metric 300
  R3(config-route-map)# set tag 30
  R3(config-route-map)#route-map EIGRP-TO-OSPF permit 40
  R3(config-route-map)# set metric 300
  R3(config-route-map)# set tag 30
  R3(config-route-map)#router ospf 1
  R3(config-router)#redistribute eigrp 100 subnets route-map EIGRP-TO-OSPF
  R3(config-router)#access-list 1 permit 10.4.0.0 0.0.0.255
  R3(config)#access-list 1 permit 10.4.1.0 0.0.0.255
  R3(config)#access-list 2 permit 10.4.2.0 0.0.0.255
  R3(config)#access-list 2 permit 10.4.3.0 0.0.0.255
  R3(config)#access-list 3 permit 10.4.4.0 0.0.0.255
  R3(config)#route-map OSPF-TO-EIGRP permit 10
  R3(config-route-map)#set metric 400 20 255 1 1500
  R3(config-route-map)#set tag 40
  R3(config-route-map)#router eigrp 100
  R3(config-router)#redistribute ospf 1 route-map OSPF-TO-EIGRP
  R3(config-router)#exit
  R3(config)#route-map EIGRP-TO-OSPF deny 5
  R3(config-route-map)#match tag 40
  R3(config-route-map)#exit
  R3(config)#route-map OSPF-TO-EIGRP deny 5
  R3(config-route-map)#match tag 10 20 30
  R3(config-route-map)#do wr

**Router R4**

.. code-block::

  R4(config)#int lo0
  R4(config-if)#ip add 10.4.0.1 255.255.255.0
  R4(config-if)#int lo1
  R4(config-if)#ip add 10.4.1.1 255.255.255.0
  R4(config-if)#int lo2
  R4(config-if)#ip add 10.4.2.1 255.255.255.0
  R4(config-if)#int lo3
  R4(config-if)#ip add 10.4.3.1 255.255.255.0
  R4(config-if)#int s1/0
  R4(config-if)#ip add 10.1.24.4 255.255.255.0
  R4(config-if)#no shut
  R4(config-if)#router eigrp 100
  R4(config-router)#net 10.0.0.0
  R4(config-router)#no auto
  R4#wr
