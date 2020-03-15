Dynamic Access Control
======================

Prepare the Dynamic Access Control Deployment Based on the Security and Business Requirements
Prepare ADDS to support Dynamic Access Control

On the Domain Controller:
-------------------------

#. Open AD Users and Computers
#. Make an OU named <OU_name_here>
#. Add Clients to OU
#. Open GPME > expand forest > expand domains, expand <domain_name>
#. Click Group Policy Objects container
#. Remove the Block Inheritance setting applied to OUs
#. Edit the Default Domain Controllers Policy GPO
#. In GPME > Computer Configuration > Policies > Administrative Templates > System > KDC
#. Enable the KDC support for claims, compound authentication and Kerberos armoring policy setting.
#. Select Supported in Options section
#. run a gpupdate /force in cmd
#. In ADDS create a security group named <name_WKS> in the Users container
#. Move the target client Computer Objects into the <OU_name_here>container
#. Make the client Computer Objects a member of <name_WKS>

Configuring User and Device Claims
----------------------------------

Review Claim Types:
^^^^^^^^^^^^^^^^^^^

On the Domain Controller:

#. Go to AD Administrative Center > Dynamic Access Control
#. Open Claim Types and make sure no claims are present.
#. Resource Properties > Properties, and review
#. New Claim Type > description > untick user, tick computer

Configuring Resource Properties and File Classifications
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

#. In Resource Property enable Confidentiality, Department
#. Go to Suggested Values of Department > click add > Value/Display name: <OU_name_here>
