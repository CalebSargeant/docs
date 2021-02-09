ISE
===

Identity Services Engine (ISE)

Adding RADIUS Clients
---------------------

Creating Locations
^^^^^^^^^^^^^^^^^^

Go to *Administration > Network Device Groups*

.. image:: _images/ise-radius-1.png

Add a group, for example:

.. image:: _images/ise-radius-2.png

Adding Devices to ISE
^^^^^^^^^^^^^^^^^^^^^

Go to *Administration > Network Devices*

.. image:: _images/ise-radius-3.png

Fill in all the details

.. image:: _images/ise-radius-4.png

Authenticator Configuration
^^^^^^^^^^^^^^^^^^^^^^^^^^^

See https://docs.calebsargeant.com/en/latest/networking/cisco/switching/aaa.html#RADIUS

ISE and AD
----------

Joining ISE to AD
^^^^^^^^^^^^^^^^^

Go to *Administration > External Identity Sources*

.. image:: _images/ise-ad-1.png

Click on *Active Directory* and click on *Add*

.. image:: _images/ise-ad-2.png

Input the details and click *Submit*

.. image:: _images/ise-ad-3.png

Click *Yes*

.. image:: _images/ise-ad-4.png

Authenticate

.. image:: _images/ise-ad-5.png

You will see the Computer object in AD

.. image:: _images/ise-ad-6.png

Identity Sources
^^^^^^^^^^^^^^^^

Go to *Administration >  Identity Source Sequences*

.. image:: _images/ise-ad-7.png

Click *Add*

.. image:: _images/ise-ad-8.png

Modify the *Identity Source Sequence* accordingly

.. image:: _images/ise-ad-9.png

Wired Dot1x Switch Config
-------------------------

Global Config
^^^^^^^^^^^^^

.. code-block:: none

  # use the radius server for dot1x authentication
  aaa authentication dot1x default group radius

  # use the radius server for authorization
  aaa authorization network default group radius

  # use the radius server for accounting
  aaa accounting dot1x default start-stop group radius

  # include IP Address of supplicant request in accounting
  radius-server attribute 8 include-in-access-req

  # enable dot1x
  dot1x system-auth-control

Switchport Config
^^^^^^^^^^^^^^^^^

.. code-block:: none

  int g0/xx
  switchport host

  #set the mode
  authentication host-mode multi-auth

  #set authentication type
  authentication open

  #set recurring authentication
  authentication periodic

  #let server decide how often to reauthenticate
  authentication timer reauthenticate server

  # set Port Access Entity to act as authenticator
  dot1x pae authenticator

  # supplicant retry timeout (sec)
  dot1x timeout tx-period 10

  # enable 802.1x control of port
  authentication port-control auto

Verification
^^^^^^^^^^^^

.. code-block:: none

  CT-SW-99#sh dot1x all
  Sysauthcontrol             Disabled
  Dot1x Protocol Version            3

  Dot1x Info for GigabitEthernet0/30
  -----------------------------------
  PAE                       = AUTHENTICATOR
  PortControl               = AUTO
  ControlDirection          = Both
  HostMode                  = MULTI_AUTH
  QuietPeriod               = 60
  ServerTimeout             = 0
  SuppTimeout               = 30
  ReAuthMax                 = 2
  MaxReq                    = 2
  TxPeriod                  = 10

  # show authentication status
  sh authen int g0/30

  # show authentication sessions
  sh authen session int g/30

  # debug
  debug radius authentication

ISE CA Certificates
-------------------

Due to installing a PKI integrated into AD, ISE will automatically receive a certificate from AD, upon joining the domain. If this does not happen, add the ROOT CA Certificate by going to *Administration > System > Certificates > Trusted Certificates* and click on *Import*

.. image:: _images/ise-cert-1.png

Choose the *Certificate File* downloaded from the Root CA, give it a *Friendly Name*, smash the Trust checkboxes and click on *Submit*.

.. image:: _images/ise-cert-2.png

To generate a CSR, go to *Certificate Signing Requests* and click on *Add*, fill in the details and click on *Generate*.

.. image:: _images/ise-cert-3.png

.. image:: _images/ise-cert-4.png

802.1x MAB (Mac Address Bypass)
-------------------------------

Switch Config
^^^^^^^^^^^^^

.. code-block:: none

  CT-SW-99#conf t

  # send over the MAC Address of the device being authenticated by switch (authenticator) to ISE (authentication server) - required for MAB
  CT-SW-99(config)#radius-server attribute 6 on-for-login-auth
  CT-SW-99(config)#radius-server attribute 25 access-request include

  # enable mab for the interface and config the order of authentication
  CT-SW-99(config)#int g0/30
  CT-SW-99(config-if)#mab
  CT-SW-99(config-if)#authentication order mab dot1x

ISE Config
^^^^^^^^^^

**Checking Authentication Logs**

To check the authentication logs go to *Operations > RADIUS > Live Logs*

.. image:: _images/ise-mab-1.png

**"MABbing" a Device**

Go to *Work Centers > Identities > Endpoints > +*

.. image:: _images/ise-mab-2.png

Fill in the details and click *Save*

.. image:: _images/ise-mab-3.png

Posture Assessment
------------------

NAC Provisioning
^^^^^^^^^^^^^^^^

Download the latest updates for ISE to check devices via NAC

.. image:: _images/ise-posture-1.png

Download the latest NAC Agents from Cisco to ISE

.. image:: _images/ise-posture-2.png

Download one of each of the latest one

.. image:: _images/ise-posture-3.png
