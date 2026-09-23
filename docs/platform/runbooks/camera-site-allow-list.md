# Camera site allow-list (MikroTik)

## Access via Public Connectivity

The below firewall rules allow the platform to connect to the cameras and router via the AWS NAT Gateways, and allow the cameras to connect to the platform via the Network Load Balancer (NLB) in AWS.

```sh
# Create the firewall address-lists, which will be used in the firewall filter rules
/ip/firewall/address-list/add list=SITE_INBOUND address=allow-in.example.com comment="Platform"
/ip/firewall/address-list/add list=SITE_OUTBOUND address=allow-out.example.com comment="Platform"
/ip/firewall/address-list/add list=SITE_MANAGEMENT address=allow.example.com comment="Platform"

# Allow the platform to connect to the cameras via the AWS NAT Gateways
/ip/firewall/filter/add place-before=0 action=accept chain=forward src-address-list=SITE_INBOUND

# Allow the platform to connect to the router itself via the AWS NAT Gateways for management purposes
/ip/firewall/filter/add place-before=0 action=accept chain=input src-address-list=SITE_MANAGEMENT

# Allow the cameras to connect to the platform via the Load Balancer in AWS
/ip/firewall/filter/add place-before=0 action=accept chain=forward dst-address-list=SITE_OUTBOUND
/ip/firewall/filter/add place-before=0 action=accept chain=output dst-address-list=SITE_OUTBOUND # Optional, if the router filters outgoing traffic
```
