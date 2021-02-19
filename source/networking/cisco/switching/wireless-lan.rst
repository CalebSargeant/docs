Wireless LAN
============

Foundation Concepts and Design
------------------------------

Types of Wireless Networks
^^^^^^^^^^^^^^^^^^^^^^^^^^

- Personal Area Network (PAN)
- Local Area Network (LAN)
- Metropolitan Area Network (MAN)
- Wide Area Network (MAN)

Wireless LAN Facts
^^^^^^^^^^^^^^^^^^

- A Wireless Access Point (WAP) communicates like a hub

  - Shared signal
  - Half duplex

- Uses unlicensed bands of radio frequency (RF)
- Wireless is a physicall and data link standard
- Uses CSMA/CA instead of CSMA/CD
- Faces connectivity issues because of interference

Understanding the SSID
^^^^^^^^^^^^^^^^^^^^^^

- The Service Set Identifier (SSID) uniquely identifies and seperates wireless networks
- When a wireless client is enabled:

  #. Client issues a proble
  #. Access Point(s) respond with a beacon
  #. Client associates with chosen SSID
  #. Access Point adds client MAC to association table

Correct Design of a WLAN
^^^^^^^^^^^^^^^^^^^^^^^^

- RF service areas should have 10-15% overlap
- Repeaters should have 50% overlap
- Bordering access points should use different channels

Client Roaming
^^^^^^^^^^^^^^

- As more mobile devices are released, client roaming becomes a big deal
- True roaming allows seamless movement between access points
- Not a feature 'Joe-Shmo' access points can support
- Provides solid coverage and better battery life
- Can be costly

Two Flavors or Roaming
^^^^^^^^^^^^^^^^^^^^^^

**Layer 2 Roaming**

Requirement: same SSID, same VLAN, same Subnet

**Layer 3 Roaming (AKA Mobile IP)**

Requirement: same SSID

How a Client Roams
^^^^^^^^^^^^^^^^^^

- Beacons are missed
- Data reaches maximum retry count
- Data rate shifts down
- Periodic intervals

Wireless VLAN Support
^^^^^^^^^^^^^^^^^^^^^

Multiple VLANs provide support for:

- Multiple security levels
- Multiple subnets
- Multiple access privileges

Frequencies and 802.11 Standards
--------------------------------

Unlicensed Frequencies
^^^^^^^^^^^^^^^^^^^^^^

- 900MHz Range: 902 - 928
- 2.4GHz Range: 2.400 - 2.483
- 5GhZ Range: 5.150 to 5.350

Understanding RF
^^^^^^^^^^^^^^^^

- RF waves are absorbed (passing through walls) or reflected (by metal)
- Higher data rates have shorter ranges
- Higher frequencies of RF have higher data rates
- Higher frequencies of RF have shorter ranges

The 802.11 Lineup
^^^^^^^^^^^^^^^^^

- 802.11b

  - Official as of september 1999
  - up to 11 mbps (1, 2, 5.5, 11 data rates)
  - most popular standard
  - three 'clean' channels

- 802.11g

  - Official as of june 2003
  - Backwards compatible with 802.11b
  - Up to 54 Mbps (12 data rates)
  - Three 'clean' channels

- 802.11a

  - Official as of september 1999
  - Up to 54 Mbps
  - Not cross-compatible with 802.11b/g
  - 12 to 23 'clean' channels

Wireless Range
^^^^^^^^^^^^^^

- The further you go, the lower your speed
- Example: 802.11g does 54Mbps if you're 40ft from the AP
- Example: 802.11a does 54Mbps if you're 20 from the AP
- Example: 802.11b does 11Mbps if you're 110ft from the AP

Wireless LAN Security
^^^^^^^^^^^^^^^^^^^^^

- Wireless has added a whole new paradigm to security
- The wireless security evolution:

  - 1997 - Wired Equivalent Privacy (WEP)
  - 2001 - 802.1x EAP
  - 2003 - Wi-Fi protected Access (WPA)
  - 2004 - IEEE 802.11i (WPA2)

Understanding the Hardware
--------------------------

Understanding the AP Categories
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Autonomous APs

  - Stand alone system
  - Cisco IoS-based
  - Can be centrally controlled using Wireless Domain Services (WDS)
  - Managed using Ciscoworks WLAN Solution Engine (WLSE)

- Lightweight APs

  - Server-dependant system
  - Zero-configuration access points
  - Can be centrally controlled using Wireless LAN Controller (WLC)
  - Managed using Cisco Wireless Control System (WCS) - optional

Understanding Lightweight Access Points
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- Lightweight Access Point Protocol (LWAPP) used between controller and WAPs
- Controller has all the intellegence for communication
- Access point acts as "dumb terminal" that processes packets
- Referred to as "split mac" design

Wireless LAN Controllers
^^^^^^^^^^^^^^^^^^^^^^^^

- 2100 series controller

  - Designed for SMB
  - Currently supports up to 6 access points

- 4400 series controller
- 4402 supports 12, 25, or 50 access points
- 4404 supports 100 access points

Cisco Wireless Indoor Access Points
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

- 1130AG

  - Indoor design
  - Slick, glowing plastic enclosure
  - Designed for cubicle/office environment

- 1240AG

  - Indoor design
  - Durable metal enclosure
  - Handle larger temperature swings
  - Manufacturing, warehouses, etc

- 1300 series

  - Outdoor design
  - your typical "put it there, get wireless" sort of AP
  - Handles outdoor temperatures (-22 to 131)
  - Can be configured as a bridge

- 1400 series

  - Outdoor design
  - Point-to-point or multipoint bridging
  - Handles outdoor temperatures
  - 8.5 mile (p2p) pr 2.75 mile (p2m) range

Power Over Ethernet
^^^^^^^^^^^^^^^^^^^

- Two Standards:

  - 802.3af
  - Cisco proprietary PoE

- Comes in many forms

  - Cisco PoE switches
  - Switch router cards
  - SOHO firewalls and routers
  - Power patch panel
  - Inline power injector

Understanding Antennas
^^^^^^^^^^^^^^^^^^^^^^

- Omni-Directional Antenna: Provides even spread of wireless signal in a radius around the access point
- Directional Antenna: Allows you to point antennas to get more radius and range in a specific direction
- Yagi Antenna: Provides dual adjustments of direction and focus. The more streamlined focus gets intense reach/range.
