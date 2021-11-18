UFW
===

Port Forwarding
---------------

https://www.cyberciti.biz/faq/how-to-configure-ufw-to-forward-port-80443-to-internal-server-hosted-on-lan/

https://serverfault.com/questions/238563/can-i-use-ufw-to-setup-a-port-forward

.. code-block:: bash

    iptables -t nat -A PREROUTING -i eth0 -p tcp -d {PUBLIC_IP} --dport 443 -j DNAT --to {INTERNAL_IP}:443
    iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
    vi /etc/ufw/before.rules
        *nat
        :PREROUTING ACCEPT [0:0]
        # forward 202.54.1.1  port 80 to 192.168.1.100:80
        # forward 202.54.1.1  port 443 to 192.168.1.100:443
        -A PREROUTING -i eth0 -d 202.54.1.1   -p tcp --dport 80 -j  DNAT --to-destination 192.168.1.100:80
        -A PREROUTING -i eth0 -d 202.54.1.1   -p tcp --dport 443 -j  DNAT --to-destination 192.168.1.100:443
        # setup routing
        -A POSTROUTING -s 192.168.1.0/24 ! -d 192.168.1.0/24 -j MASQUERADE
        COMMIT

Disable UFW
-----------

https://askubuntu.com/questions/275998/can-i-uninstall-ufw-completely

.. code-block:: bash

    ufw disable
    apt-get remove ufw
    apt-get purge ufw

Status
------

https://serverfault.com/questions/516838/where-are-the-logs-for-ufw-located-on-ubuntu-server

https://fedingo.com/how-to-check-ufw-log-status/

.. code-block:: bash

    ufw status verbose
    ufw logging on