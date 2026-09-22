# Monitoring

## Zabbix

### Slack Alerting

**Configuring Slack**

Go to <https://api.slack.com/apps>. Create a new app called "Zabbix".

![zabbix slack](_images/zabbix-slack-2.png)

Create an *Incoming Webhook*.

![zabbix slack](_images/zabbix-slack-3.png)

![zabbix slack](_images/zabbix-slack-4.png)

Copy the curl request to `/usr/lib/zabbix/alertscripts/slackalerts.sh`.

![zabbix slack](_images/zabbix-slack-5.png)

Change `'{"text":"Hello, World!"}'` to `'{"text":"'"$1"'"}'`.

Test your configuration on Zabbix with `/usr/lib/zabbix/alertscripts/slackalerts.sh test`.

**Configuring Zabbix**

Create the *Media Type* in Zabbix.

![zabbix slack](_images/zabbix-slack-1.png)

Create an *Action* and an *Operation* in *Operations*, *Recovery operations*, and *Update operations*.

Nice *Default subjects* to use: Create `{ZABBIX.SERVER}` in **Administration** \> **General** \> **Macros**

- `[{ZABBIX.SERVER}] - [{HOST.HOST}] Problem: {EVENT.NAME}`
- `[{ZABBIX.SERVER}] - [{HOST.HOST}] Resolved: {EVENT.NAME}`
- `[{ZABBIX.SERVER}] - [{HOST.HOST}] Updated problem: {EVENT.NAME} - {USER.FULLNAME}`

![zabbix slack](_images/zabbix-slack-6.png)

![zabbix slack](_images/zabbix-slack-7.png)

Add the *Media* to the Administrator.

![zabbix slack](_images/zabbix-slack-8.png)

## Nagios

### Install Nagios Client on Ubuntu

<https://tecadmin.net/how-to-install-nrpe-on-ubuntu-20-04/>

``` bash
apt update
apt install nagios-nrpe-server nagios-plugins
nano /etc/nagios/nrpe.cfg
  allowed_hosts=127.0.0.1, 192.168.1.100
systemctl restart nagios-nrpe-server 
```
