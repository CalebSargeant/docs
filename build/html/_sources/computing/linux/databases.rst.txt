Databases
=========

MySQL
-----

Creating a User
^^^^^^^^^^^^^^^

.. code-block:: bash

  # Note that localhost could be a location somewhere else, like a source IP Address of machine connecting to mysql
  create user 'myuser'@'localhost' identified by 'password';

Deleting a User
^^^^^^^^^^^^^^^

.. code-block:: bash

  # Note that localhost could be a location somewhere else, like a source IP Address of machine connecting to mysql
  drop user 'user'@'localhost';

Showing Users
^^^^^^^^^^^^^

.. code-block:: bash

  select user from mysql.user;
  select user,host from mysql.user;

Logging in Remotely
^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # You can -p'mypassword' as well
  mysql -u myuser -p -h mydbhostname.com -D mydatabase

Privileges
^^^^^^^^^^

.. code-block:: bash

  ALL PRIVILEGES- as we saw previously, this would allow a MySQL user full access to a designated database (or if no database is selected, global access across the system)
  CREATE- allows them to create new tables or databases
  DROP- allows them to them to delete tables or databases
  DELETE- allows them to delete rows from tables
  INSERT- allows them to insert rows into tables
  SELECT- allows them to use the SELECT command to read through databases
  UPDATE- allow them to update table rows
  GRANT OPTION- allows them to grant or remove other users’ privileges

Granting Privileges
^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # Note that localhost could be a location somewhere else, like a source IP Address of machine connecting to mysql
  grant all privileges on mydb.* to 'user'@'localhost';
  flush privileges;

Revoking Privileges
^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # Note that localhost could be a location somewhere else, like a source IP Address of machine connecting to mysql
  revoke DROP on databasename.tablename from 'username'@'localhost';
  flush privileges;

Showing Privileges
^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  show grants for 'username'@'host';

Updating Data
^^^^^^^^^^^^^

.. code-block:: bash

  update table set column1=newvalue1, column2=newvalue2, where condition;

Deleting Data
^^^^^^^^^^^^^

.. code-block:: bash

  delete from table_name where condition;

Checking MySQL Status
^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  service mysqld status
  ps aux | grep mysql


Backup
^^^^^^

.. code-block:: bash

  # Backup directly to a remote host (zabbix is the DB name)
  # That pipes the mysqldump command through gzip, then to through and SSH connection. SSH on the remote side runs the ‘cat’ command to read the stdin, then redirects that to the actual file where I want it saved.
  mysqldump -u root -p zabbix | gzip -c | ssh caleb.sargeant@server.example.com "cat > zabbix.sql.gz"

Restore
^^^^^^^

The file must be in .sql format. It can not be compressed in a .zip or .tar.gz file.

``mysql -p -u username database_name < file.sql``

Use
^^^

https://www.tutorialspoint.com/mysql/mysql-select-database.htm

.. code-block:: bash

  show databases;
  use database;

Setting up Replication
^^^^^^^^^^^^^^^^^^^^^^

https://www.digitalocean.com/community/tutorials/how-to-set-up-replication-in-mysql

Size of DB
^^^^^^^^^^

.. code-block:: bash

  SELECT table_schema "zabbix",
          ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) "DB Size in MB"
  FROM information_schema.tables
  GROUP BY table_schema;

Resetting Root Password
^^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  /etc/init.d/mysqld stop
  mysqld_safe --skip-grant-tables &
  mysql -u root
  mysql> use mysql;
  mysql> update user set password=PASSWORD("newrootpassword") where User='root';
  mysql> flush privileges;
  mysql> quit
  /etc/init.d/mysqld stop
  /etc/init.d/mysqld start

Checking the Version
^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  # https://stackoverflow.com/questions/8987679/how-to-retrieve-the-current-version-of-a-mysql-database-management-system-dbms
  select @@version;

Checking Database Size
^^^^^^^^^^^^^^^^^^^^^^

https://stackoverflow.com/questions/1733507/how-to-get-size-of-mysql-database

.. code-block:: bash

  SELECT table_schema "DB Name",
        ROUND(SUM(data_length + index_length) / 1024 / 1024, 1) "DB Size in MB" 
  FROM information_schema.tables 
  GROUP BY table_schema; 

Import Database with Progress Bar
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

https://gist.github.com/infusion/492418723b6736784af1

https://dba.stackexchange.com/questions/17367/how-can-i-monitor-the-progress-of-an-import-of-a-large-sql-file

.. code-block:: bash

  pv dump.sql.tar.gz | tar xO | mysql -u $user -p $database
  # Or
  pv sqlfile.sql | mysql -u root -p database

Reinstall Mysql after Deleting /var/lib/mysql
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

https://dba.stackexchange.com/questions/103625/how-to-reinitialise-var-lib-mysql-files

https://mariadb.com/kb/en/mysql_secure_installation/

.. code-block:: bash

  mkdir /var/lib/mysql
  mkdir /var/lib/mysql/mysql
  chown -R mysql:mysql /var/lib/mysql
  mysql_secure_installation

PostgreSQL
----------

Deleting Rows
^^^^^^^^^^^^^

.. code-block:: bash

  delete from msisdn_seen where msisdn like '27234843223';

Selecting Rows
^^^^^^^^^^^^^^

https://stackoverflow.com/questions/924729/how-to-best-display-in-terminal-a-mysql-select-returning-too-many-fields

.. code-block:: bash

  # remember to use \G to display it nicely
  select * from msisdn_seen where msisdn like '27234843223';

Updating Data in Table
^^^^^^^^^^^^^^^^^^^^^^

.. code-block:: bash

  update table_name set column1=value1 where condition;

Show Tables
^^^^^^^^^^^

https://www.postgresqltutorial.com/postgresql-show-tables/

.. code-block:: bash

  \dt

Connect to Database
^^^^^^^^^^^^^^^^^^^

Same as use in mysql https://www.tutorialspoint.com/postgresql/postgresql_select_database.htm

.. code-block:: bash

  \c database;

Backup Database
^^^^^^^^^^^^^^^

https://dba.stackexchange.com/questions/17740/how-to-get-a-working-and-complete-postgresql-db-backup-and-test

.. code-block:: bash

  pg_dumpall -U postgres -h localhost --clean --file=dump.sql