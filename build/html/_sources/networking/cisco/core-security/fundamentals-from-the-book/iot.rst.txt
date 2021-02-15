IoT Security Threats
====================

* IoT is any computer device (mechanical & digital) that transfers data in network without requiring human-to-human or human-to-computer interaction. Sensors, home appliances, cameras, wearables, etc. are examples of IoT devices.
* Fog computing is the processing of data and events from IoT devices as close to source as possible. Fog-edge device sends required data to cloud.

.. image:: _images/security-fundamentals-iot-1.png

.. image:: _images/security-fundamentals-iot-2.png

Architectural components of IoT:

* Data collection: Centralized data collection presents a few challenges for an IoT environment to be able to scale. For instance, managing millions of sensors in a smart grid network cannot efficiently be done using a centralized approach.
* Network resource preservation: This is particularly important because network bandwidth may be limited, and centralized IoT device data collection leads to using a large amount of the network capabilities.
* Closed-loop functioning: IoT environments often require reduced reaction times.

Security Challenges & Considerations:

* Numerous IoT devices are inexpensive devices with little to no security capabilities.
* IoT devices are typically constrained in memory and compute resources and do not support complex and evolving security and encryption algorithms.
* Several IoT devices are deployed with no backup connectivity if the primary connection is lost.
* Numerous IoT devices require secure remote management during and after deployment (onboarding).
* IoT devices often require the management of multiparty networks. Governance of these networks is often a challenging task. For example, who will accept liability for a breach? Who is in charge of incident response? Who has provisioning access? Who has access to the data?
* Crypto resilience is a challenge in many IoT environments. These embedded devices (such as smart meters) are designed to last decades without being replaced.
* Physical protection is another challenge, because any IoT device could be stolen, moved, or tampered with.
* Administrations should pay attention to how the IoT device authenticates to multiple networks securely.
* IoT technologies like INSTEON, Zigbee, Z-Wave, LoRaWAN, and others were not designed with security in mind (however, they have improved significantly over the past few years).

IoT Protocols
-------------

* Zigbee: One of the most popular protocols supported by many consumer IoT devices. Zigbee takes advantage of the underlying security services provided by the IEEE 802.15.4 MAC layer. The 802.15.4 MAC layer supports the AES algorithm with a 128-bit key for both encryption and decryption. Additional information about Zigbee can be obtained from the Zigbee Alliance at https://www.zigbee.org.
* Bluetooth Low Energy (BLE) and Bluetooth Smart: BLE is an evolution of the Bluetooth protocol that is designed for enhanced battery life for IoT devices. Bluetooth Smart–enabled devices default to “sleep mode” and “wake up” only when needed. Both operate in the 2.4 GHz frequency range. Bluetooth Smart implements high-rate frequency-hopping spread spectrum and supports AES encryption. Additional information about BLE and Bluetooth Smart can be found at https://www.bluetooth.com.
* Z-Wave: Another popular IoT communication protocol. It supports unicast, multicast, and broadcast communication. Z-Wave networks consist of controllers and slaves. Some Z-Wave devices can be both primary and secondary controllers. Primary controllers are allowed to add and remove nodes form the network. Z-Wave devices operate at a frequency of 908.42 MHz (North America) and 868.42 MHz (Europe) with data rates of 100Kbps over a range of about 30 meters. Additional information about Z-Wave can be obtained from the Z-Wave Alliance at https://z-wavealliance.org.
* INSTEON: A protocol that allows IoT devices to communicate wirelessly and over the power lines. It provides support for dual-band, mesh, and peer-to-peer communication. Additional information about INSTEON can be found at https://www.insteon.com/technology/.
* Long Range Wide Area Network (LoRaWAN): A networking protocol designed specifically for IoT implementations. LoRaWAN has three classes of endpoint devices: Class A (lowest power, bidirectional end devices), Class B (bidirectional end devices with deterministic downlink latency), and Class C (lowest latency, bidirectional end devices). Additional information about LoRaWAN can be found at the Lora Alliance at https://lora-alliance.org.
* Wi-Fi: Still one of the most popular communication methods for IoT devices.
* Low Rate Wireless Personal Area Networks (LRWPAN) and IPv6 over Low Power Wireless Personal Area Networks (6LoWPAN): IPv4 and IPv6 both play a role at various points within many IoT systems. IPv6 over Low Power Wireless Personal Area Networks (6LoWPAN) supports the use of IPv6 in the network-constrained IoT implementations. 6LoWPan was designed to support wireless Internet connectivity at lower data rates. 6LoWPAN builds upon the 802.15.4 Low Rate Wireless Personal Area Networks (LRWPAN) specification to create an adaptation layer that supports the use of IPv6.
* Cellular Communication: Also a popular communication method for IoT devices, including connected cars, retail machines, sensors, and others. 4G and 5G are used to connect many IoT devices nowadays.

IoT Messaging Protocols:

* MQTT
* Constrained Application Protocol (CoAP)
* Data Distribution Protocol (DDP)
* Advanced Message Queuing Protocol (AMQP)
* Extensible Messaging and Presence Protocol (XMPP)

Hacking IoT Implementations
---------------------------

Hacking Methods:

* Hardware tools:

  * Multimeters
  * Oscilloscopes
  * Soldering tools
  * UART debuggers and tools
  * Universal interface tools like JTAG, SWD, I2C, and SPI tools
  * Logic analyzers

* Reverse engineering tools, such as disassemblers and debuggers:

  * IDA
  * Binary Ninja
  * Radare2
  * Ghidra
  * Hopper

* Wireless communication interfaces and tools:

  * Ubertooth One (for Bluetooth hacking)
  * Software-defined radio (SDR), such as HackRF and BladeRF, to perform assessments of Z-Wave and Zigbee implementations
