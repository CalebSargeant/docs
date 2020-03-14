Monitoring
==========

Zabbix
------

Slack Alerting
^^^^^^^^^^^^^^

**Configuring Slack**

Go to https://api.slack.com/apps. Create a new app called "Zabbix".

.. image:: _images/zabbix-slack-2.png
    :width: 663px
    :align: center
    :height: 424px

Create an *Incoming Webhook*.

.. image:: _images/zabbix-slack-3.png
    :width: 663px
    :align: center
    :height: 424px

.. image:: _images/zabbix-slack-4.png
    :width: 663px
    :align: center
    :height: 424px

Copy the curl request to ``/usr/lib/zabbix/alertscripts/slackalerts.sh``.

.. image:: _images/zabbix-slack-5.png
    :width: 663px
    :align: center
    :height: 424px

Change ``'{"text":"Hello, World!"}'`` to ``'{"text":"'"$1"'"}'``.

Test your configuration on Zabbix with ``/usr/lib/zabbix/alertscripts/slackalerts.sh test``.

**Configuring Zabbix**

Create the *Media Type* in Zabbix.

.. image:: _images/zabbix-slack-1.png
    :width: 663px
    :align: center
    :height: 424px

Create an *Action* and an *Operation* in *Operations*, *Recovery operations*, and *Update operations*.

Nice *Default subjects* to use:
Create ``{ZABBIX.SERVER}`` in **Administration** > **General** > **Macros**

* ``[{ZABBIX.SERVER}] - [{HOST.HOST}] Problem: {EVENT.NAME}``
* ``[{ZABBIX.SERVER}] - [{HOST.HOST}] Resolved: {EVENT.NAME}``
* ``[{ZABBIX.SERVER}] - [{HOST.HOST}] Updated problem: {EVENT.NAME} - {USER.FULLNAME}``

.. image:: _images/zabbix-slack-6.png
    :width: 663px
    :align: center
    :height: 424px

.. image:: _images/zabbix-slack-7.png
    :width: 663px
    :align: center
    :height: 424px

Add the *Media* to the Administrator.

.. image:: _images/zabbix-slack-8.png
    :width: 663px
    :align: center
    :height: 424px
