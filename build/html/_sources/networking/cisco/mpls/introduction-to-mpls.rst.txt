Introduction to MPLS
====================

What is MPLS?
-------------

- Multi-Protocol Label Switching is a new paradigm in the way routers make forwarding decisions.
- Multiprotocol: MPLS is capable of **transporting many L2 and L3 protocols**
- Label Switching: Packets are **switched** based on **labels**, not destination IP!
- Labels - Ultimately determine the destiny of a packet through an MPLS network

Why MPLS?
---------

- Unified network infrastructure
- ATM concepts integrated into an IP world
- Scalable and secure L3 VPNs using a peer-to-peer model
- BGP-free core
- Traffic engineering capabilities
- WAN Quality of Service (QoS) requirements

MPLS Key Terms
--------------

MPLS Labels
^^^^^^^^^^^

- MPLS is often described as a **shim** or **layer 2.5 protocol**
- An MPLS packet contains a label stack, consisting of one or more MPLS labels

.. image:: _images/mpls-1.png

- **Label** - the MPLS label itself, determines destiny of the packet
- **EXP**- Experimental (not so much any more), used for QoS markings
- **S** - Boolean, if set to 1, it's bottom of the label stack. If 0, there's another label on the stack
- **TTL** - Time-to-live for loop prevention and hop count (as it is in IP)

**Push vs Pop vs Swap**
- The **swap** operation means that the top label in the label stack is replaced with another
- The **push** operation means that the top label is replaced with another and then one or more additional labels are pushed onto the label stack
- The **pop** operation means that the top label is removed

Label Switched Routers
^^^^^^^^^^^^^^^^^^^^^^

- A **label switched router** (LSR) is a router running MPLS
- LSR can be an **ingress** edge, **intermediate** or **egress** edge LSR
- A Label Switched Path (LSP) is the series of LSRs that switch a labeled packet

.. image:: _images/mpls-2.png

Forwarding Equivalency Class (FEC)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Group of packets that are forwarded the same way through the MPLS network
- Every packet in the same FEC enters the MPLS network with the same label
- FEC can theoretically be based on many different things L3 destination prefix, QoS, L2 PVC, BGP next-hop, TE tunnel, link color, etc...
