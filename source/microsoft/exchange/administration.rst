##############
Administration
##############

Add Email Address to User
-------------------------

Gives a secondary email address to the user

.. code-block:: powershell

  set-mailbox user -emailaddresses @{add='email@example.com'}

Calendar Permissions
--------------------

Gives Tracey read only access to Brittany, Lood, Brenda, Janelle, and Hilary's calendars. Tracey can ask to put an appointment on their calendar, but cannot create or edit without the owner's consent.

.. code-block:: powershell

  set-mailboxfolderpermission -identity brittany:\calendar -user tracey -accessrights reviewer
  set-mailboxfolderpermission -identity lood:\calendar -user tracey -accessrights reviewer
  set-mailboxfolderpermission -identity brenda:\calendar -user tracey -accessrights reviewer
  set-mailboxfolderpermission -identity janelle:\calendar -user tracey -accessrights reviewer
  set-mailboxfolderpermission -identity hilary:\calendar -user tracey -accessrights reviewer

Exhange Access Rights
^^^^^^^^^^^^^^^^^^^^^

Sourced from http://umanitoba.ca/computing/ist/email/exchange/exchangecalendarroles.html

Exchange offers you the ability to give others varying levels of access rights. The following levels of rights are available, and are explained in terms of calendar rights:

* **Reviewer:** The person can view events on your calendar only. They cannot make changes to your calendar. This is the permission level to select if you don't want to grant any write or change permissions to the other person. (This is similar to giving someone Viewing Rights in CorporateTime)
* **Contributor:** The person can ONLY add events to your calendar, but they cannot view, modify, or delete any events on your calendar. (CorporateTime did not provide a similar access level to this)
* **Nonediting Author:** The person can create events on your calendar and view your calendar, but they can't modify any events once they have been have placed on your calendar, and they can't delete any of your events. (CorporateTime did not provide a similar access level to this)
* **Author:** The person can create events on your calendar and view your calendar but cannot modify or delete any events that you have placed on your calendar. This person can modify or delete only the events they created on your calendar. (CorporateTime did not provide a similar access level to this)
* **Publishing Author:** This level of access provides the same permissions as Author but also allows the person to create subfolders. (CorporateTime did not provide a similar access level to this)
* **Editor:** The person can create, view, modify, and delete events on your calendar. This level of access effectively gives the person full read and write access to your calendar. (This is similar to giving someone Delegate rights in CorporateTime)
* **Publishing Editor:** This level of access provides the same permissions as Editor but also allows the person to create subfolders. (This is similar to giving someone Delegate rights in CorporateTime)
* **Owner:** The person can create, view, modify, and delete events on your calendar. As the folder owner this person will also have the ability to grant or change permissions for other people to this calendar.
* **Free/Busy time:** This setting is typically set to the Default user and restricts other Exchange calendars not given permissions to view your calendar except when being scheduled. At that time the only thing people can see is a blue block (busy time) or white (free time).
* **Free/Busy time, subject, location:** This setting is one step up from the default setting. This will allow other Exchange Calendars the ability to see that you are busy, where you are, and the subject of the meeting. All other information is blocked from them and if they double-click on a meeting will be told they do not have sufficient permissions to view the calendar.

Create a Service Account
------------------------

.. code-block:: powershell

  New-Mailbox -Name 'B2B' -Alias 'B2B' -OrganizationalUnit 'example.com/User Accounts/Newlands/IT Service Accounts' -UserPrincipalName 'accountname@example.com' -SamAccountName 'accountname' -FirstName 'accountname' -Initials '' -LastName '' -Password 'System.Security.SecureString' -ResetPasswordOnNextLogon $false -Database 'Example - Services Mailbox'

Delete a Mailbox
----------------

.. warning::

	This will delete both the AD user and the exchange mailbox!

.. code-block:: powershell

  Remove-Mailbox -Identity "name surname" -Permanent $true

Mailbox Access Permission
-------------------------

Removes Caleb's access to Bob's mailbox:

.. code-block:: powershell

  remove-mailboxpermission -identity bob -user caleb -accessrights fullaccess
