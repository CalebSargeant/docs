Compliance Management
=====================

Regulatory Compliance
---------------------

Is very important in most exchange environments. Ensuring your organisation is in sync with legal requirements with
regard to eDiscovery and other key aspects to compliance is a must for Exchange administrators.

eDiscovery searches ones mailbox for specific strings.

Compliance Features
-------------------

* In-Place eDiscovery & Hold

  * Allows a search of mailboxes through the organisation, preview of search results and then copy of results to a Discovery mailbox
  * In-Place Hold forces a hold on data discovered during in-place eDiscovery
  * Note: Legal Hold or Litigation Hold places entire mailbox on hold

* Auditing

  * Keeps an audit log of all actions taken on all mailboxes - Auditing is done based on access by owners, delegates and administrators
  * You can run various reports (exp. administrator role group report)

* Transport Rules

  * Allows you to create conditions, actions and exceptions over mail tthat is flowing through your organistation

* Data Loss Prevention (DLP)

  * A form of transport rule that prevents users (or alerts users) from sending sensitive information like creditc card numbers - Based on regulatory standards (PII and PCI-DSS)

* Messaging Records Management (MRM)

  * Revolves around email lifecycle policies - Retention policies are used to classify messages

* Journaling

  * Provides the ability to retain copies of all incoming and outgoing mail through Standard journaling
  * Provides more granular journaluing throiguh pPremium Journaling
  * Require Enterprise Client-access Liscense for mailboxes

* Information Rights Management (IRM)

  * Works in harmony with ADRMS to protect messages and attachements

* In-Place Archive

  * Eliminates the proliferation of .pst files

Scenario
--------

* Enable default retention policy and in-place archive over Justin Beiber
* Establish a standard journaling rule for all email going in and outh of the organisation
* Place John Doe mailbox on Litigation Hold

Howto
-----

* compliance management > in-place e discovery and hold
* compliance management > retention policies (then recipients > mailbox features > Litigation hold)
* compliance management > Journal rule (start-managedfolderassistant -identity "caleb sargeant")
