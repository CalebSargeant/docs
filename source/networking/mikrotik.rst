Mikrotik
========

L2TP Ports and Protocols
------------------------

https://serverfault.com/questions/451381/which-ports-for-ipsec-lt2p

Protocol: UDP, port 500 (for IKE, to manage encryption keys)
Protocol: UDP, port 4500 (for IPSEC NAT-Traversal mode)
Protocol: ESP, value 50 (for IPSEC)
Protocol: AH, value 51 (for IPSEC)