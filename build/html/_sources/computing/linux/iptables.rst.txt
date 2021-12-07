IPTables
========

Multiple Ports
--------------

https://serverfault.com/questions/353130/iptables-and-multiple-ports

.. code-block:: bash

  iptables -A INPUT -p tcp --match multiport --dports 110,143,993,995 -j ACCEPT

Adding a Rule
-------------

https://unix.stackexchange.com/questions/145929/how-to-ensure-ssh-port-is-only-open-to-a-specific-ip-address

.. code-block:: bash

  iptables -A INPUT -p tcp -s 192.168.0.0/24 --dport 22 -j ACCEPT

Comments
--------

https://stackpointer.io/unix/linux-add-comment-to-iptables-rule/641/#:~:text=To%20add%20a%20comment%20to,rule%20in%20the%20INPUT%20chain.&text=We%20can%20verify%20that%20the,running%20the%20following%20iptables%20command.

.. code-block:: bash

  iptables -A INPUT -p tcp --dport 22 -m comment --comment "allow ssh"
  iptables -A INPUT -p udp --dport 53 -j ACCEPT
  iptables -A OUTPUT -p udp --dport 53 -j ACCEPT

Allowing Incoming Traffic after Changing Default Policy
-------------------------------------------------------

https://serverfault.com/questions/356282/cannot-ping-outside-network-with-these-ip-rules
https://www.linuxquestions.org/questions/linux-newbie-8/iptables-dns-resolve-issue-4175493915/

.. code-block:: bash

  iptables -I INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT


Deleting a Rule
---------------

https://stackoverflow.com/questions/10197405/how-can-i-remove-specific-rules-from-iptables

.. code-block:: bash

  # replace -A with -D
  iptables -A

  # becomes
  iptables -D

Port Forwarding
---------------

.. code-block:: bash

  echo '1' | sudo tee /proc/sys/net/ipv4/conf/eth0/forwarding
  iptables -t nat -A PREROUTING -p tcp --dport 20443 -j DNAT --to-destination 10.8.8.188:443
  iptables -A FORWARD -p tcp -s 10.8.8.188 —dport 443 -j ACCEPT
  iptables -t nat -A POSTROUTING -j MASQUERADE

Persistent Rules
----------------

https://www.e2enetworks.com/help/knowledge-base/how-to-open-ports-on-iptables-in-a-linux-server/#step-3-save-the-iptable-rule

.. code-block:: bash

  netfilter-persistent save
  netfilter-persistent reload

https://upcloud.com/community/tutorials/configure-iptables-ubuntu/

.. code-block:: bash

  iptables-save > /etc/iptables/rules.v4

Listing Rules
-------------

https://serverfault.com/questions/836497/iptables-have-both-accept-all-anywhere-anywhere-and-drop-all-anywhere-anywher

.. code-block:: bash

  iptables -v -L

Allow Only Certain IP Ranges
----------------------------

https://www.linode.com/community/questions/17544/how-do-i-allow-only-certain-ips-with-iptables

.. code-block:: bash

  iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
  iptables -A INPUT -i lo -m comment --comment "Allow loopback connections" -j ACCEPT
  iptables -A INPUT -p icmp -m comment --comment "Allow Ping to work as expected" -j ACCEPT
  iptables -A INPUT -s 192.168.1.0/24 -j ACCEPT
  iptables -A INPUT -s 198.51.100.0 -j ACCEPT
  iptables -P INPUT DROP
  iptables -P FORWARD DROP

Logging
-------

.. code-block:: bash

  -A INPUT -j LOG --log-prefix "Dropped INPUT Packet: "
  -A FORWARD -j LOG --log-prefix "Dropped FORWARD Packet: "
  