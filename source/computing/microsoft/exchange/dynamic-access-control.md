# Dynamic Access Control

Prepare the Dynamic Access Control Deployment Based on the Security and
Business Requirements Prepare ADDS to support Dynamic Access Control

## On the Domain Controller:

1.  Open AD Users and Computers
2.  Make an OU named <OU_name_here>
3.  Add Clients to OU
4.  Open GPME > expand forest > expand domains, expand <domain_name>
5.  Click Group Policy Objects container
6.  Remove the Block Inheritance setting applied to OUs
7.  Edit the Default Domain Controllers Policy GPO
8.  In GPME > Computer Configuration > Policies > Administrative
    Templates > System > KDC
9.  Enable the KDC support for claims, compound authentication and
    Kerberos armoring policy setting.
10. Select Supported in Options section
11. run a gpupdate /force in cmd
12. In ADDS create a security group named <name_WKS> in the Users
    container
13. Move the target client Computer Objects into the
    <OU_name_here>container
14. Make the client Computer Objects a member of <name_WKS>

## Configuring User and Device Claims

### Review Claim Types:

On the Domain Controller:

1.  Go to AD Administrative Center > Dynamic Access Control
2.  Open Claim Types and make sure no claims are present.
3.  Resource Properties > Properties, and review
4.  New Claim Type > description > untick user, tick computer

### Configuring Resource Properties and File Classifications

1.  In Resource Property enable Confidentiality, Department
2.  Go to Suggested Values of Department > click add > Value/Display
    name: <OU_name_here>
