########
IPTables
########

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
