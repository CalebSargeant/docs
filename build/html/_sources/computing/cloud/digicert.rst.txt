DigiCert
========

Enabling IP Restrictions
------------------------

IP Restrictions are enabled in the DigiCert control panel under *Settings > IP Restrictions*. We cannot define the IP Addresses to restrict to until we have enabled this option.

.. image:: _images/digicert-1.png

Once the option is enabled, we are able to add IP Addresses to restrict.

.. image:: _images/digicert-2.png

We will be adding all of our public IP Addresses.

.. image:: _images/digicert-3.png

.. image:: _images/digicert-4.png

Giving Access to DigiCert via Split-Tunnel
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

By default, we will be able to access the DigiCert control panel when working from the office. We need to add DigiCert's IP Addresses to our outside interface split-tunnel configuration so that we can access the DigiCert control panel when VPNing from outside the office. DigiCert uses static IP Addresses which are unlikely to change; however, if they do, we will not be able to access the DigiCert control panel through VPN until we update the split-tunnel configuration.

Change on ASA Example

.. code-block:: none

  access-list OUTSIDE_SPLIT_ACL standard permit host 45.60.121.229
  access-list OUTSIDE_SPLIT_ACL standard permit host 45.60.123.229
  access-list OUTSIDE_SPLIT_ACL standard permit host 45.60.131.229
