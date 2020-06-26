Cloud Security Threats
======================

NIST Special Publication 800-145 compares different cloud services and deployment strategies.

NIST Special Publication 500-292, “NIST Cloud Computing Reference Architecture"

* Everyone is going cloud, hybrid-cloud, or multi-cloud.
* Move from CapEX to OpEx (capital to operation expenditure).
* Security in cloud has same functionality to traditional security.
* Cloud computing security is becoming more and more vital (protection from theft, data exfiltration, deletion, and privacy)

Advantages of cloud:

* Distributed storage
* Scalability
* Resource pooling
* Access from any location
* Measured service
* Automated management

NIST says characteristics of cloud computing include:

* On-demand self-service
* Broad network access
* Resource pooling
* Rapid elasticity
* Measured service

Cloud deployment models:

* Public cloud: Open for public use.
* Private cloud: Used just by the client organisation on the premises (on-prem) or at a dedicated area in a cloud provider.
* Community cloud: Shared between several organisations.
* Hybrid cloud: Composed of two or more clouds (including on-prem services).

Cloud computing models:

* Infrastructure as a Service (IaaS): IaaS describes a cloud solution where you are renting infrastructure. You purchase virtual power to execute your software as needed. This is much like running a virtual server on your own equipment, except you are now running a virtual server on a virtual disk. This model is similar to a utility company model because you pay for what you use.
* Platform as a Service (PaaS): PaaS provides everything except applications. Services provided by this model include all phases of the system development life cycle (SDLC) and can use application programming interfaces (APIs), website portals, or gateway software. These solutions tend to be proprietary, which can cause problems if the customer moves away from the provider’s platform.
* Software as a Service (SaaS): SaaS is designed to provide a complete packaged solution. The software is rented out to the user. The service is usually provided through some type of front end or web portal. While the end user is free to use the service from anywhere, the company pays a per-use fee.

Cloud Computing Issues and Concerns
-----------------------------------

Cloud is someone else's computer. Questions to ask the (/yourself about the) cloud provider:

* Who has access? Access control is a key concern because insider attacks are a huge risk. Anyone who has been approved to access the cloud is a potential hacker, so you want to know who has access and how they were screened. Even if it was not done with malice, an employee can leave, and then you find out that you don’t have the password, or the cloud service gets canceled because maybe the bill didn’t get paid.
* What are your regulatory requirements? Organizations operating in the United States, Canada, or the European Union have many regulatory requirements that they must abide by (for example, ISO/IEC 27002, EU-U.S. Privacy Shield Framework, ITIL, and COBIT). You must ensure that your cloud provider can meet these requirements and is willing to undergo certification, accreditation, and review.
* Do you have the right to audit? This particular item is no small matter in that the cloud provider should agree in writing to the terms of the audit. With cloud computing, maintaining compliance could become more difficult to achieve and even harder to demonstrate to auditors and assessors. Of the many regulations touching upon information technology, few were written with cloud computing in mind. Auditors and assessors might not be familiar with cloud computing generally or with a given cloud service in particular.
* What type of training does the provider offer its employees? This is a rather important item to consider because people will always be the weakest link in security. Knowing how your provider trains its employees is an important item to review.
* What type of data classification system does the provider use? Questions you should be concerned with here include what data classification standard is being used and whether the provider even uses data classification.
* How is your data separated from other users’ data? Is the data on a shared server or a dedicated system? A dedicated server means that your information is the only thing on the server. With a shared server, the amount of disk space, processing power, bandwidth, and so on is limited because others are sharing this device. If it is shared, the data could potentially become comingled in some way.
* Is encryption being used? Encryption should be discussed. Is it being used while the data is at rest and in transit? You will also want to know what type of encryption is being used. For example, there are big technical difference between DES and AES. For both of these algorithms, however, the basic questions are the same: Who maintains control of the encryption keys? Is the data encrypted at rest in the cloud? Is the data encrypted in transit, or is it encrypted at rest and in transit?
* What are the service level agreement (SLA) terms? The SLA serves as a contracted level of guaranteed service between the cloud provider and the customer that specifies what level of services will be provided.
* What is the long-term viability of the provider? How long has the cloud provider been in business, and what is its track record? If it goes out of business, what happens to your data? Will your data be returned and, if so, in what format?
* Will the provider assume liability in the case of a breach? If a security incident occurs, what support will you receive from the cloud provider? While many providers promote their services as being unhackable, cloud-based services are an attractive target to hackers.
* What is the disaster recovery/business continuity plan (DR/BCP)? Although you might not know the physical location of your services, it is physically located somewhere. All physical locations face threats such as fire, storms, natural disasters, and loss of power. In case of any of these events, how will the cloud provider respond, and what guarantee of continued services is it promising?
* What happens to my data should I wish to terminate the contract?

Cloud Computing Attacks
-----------------------

Attack vectors:

* Session hijacking: This attack occurs when the attacker can sniff traffic and intercept traffic to take over a legitimate connection to a cloud service.
* DNS attack: This form of attack tricks users into visiting a phishing site and giving up valid credentials.
* Cross-site scripting (XSS): Used to steal cookies that can be exploited to gain access as an authenticated user to a cloud-based service.
* SQL injection: This attack exploits vulnerable cloud-based applications that allow attackers to pass SQL commands to a database for execution.
* Session riding: This term is often used to describe a cross-site request forgery attack. Attackers use this technique to transmit unauthorized commands by riding an active session by using an email or malicious link to trick users while they are currently logged in to a cloud service.
* Distributed denial-of-service (DDoS) attack: Some security professionals have argued that the cloud is more vulnerable to DDoS attacks because it is shared by many users and organizations, which also makes any DDoS attack much more damaging.
* Man-in-the-middle cryptographic attack: This attack is carried out when the attacker places himself in the communication path between two users. Anytime the attacker can do this, there is the possibility that he can intercept and modify communications.
* Side-channel attack: An attacker could attempt to compromise the cloud by placing a malicious virtual machine in close proximity to a target cloud server and then launching a side-channel attack.
* Authentication attack: Authentication is a weak point in hosted and virtual services and is frequently targeted. There are many ways to authenticate users, such as based on what a person knows, has, or is. The mechanisms used to secure the authentication process and the method of authentication used are frequent targets of attackers.
* API attacks: Often APIs are configured insecurely. An attacker can take advantage of API misconfigurations to modify, delete, or append data in applications or systems in cloud environments.

Cloud Computing Security
------------------------

Responsibility of cloud provider and consumer. Considerations:

* DR
* SLAs
* Data integrity & encryption
