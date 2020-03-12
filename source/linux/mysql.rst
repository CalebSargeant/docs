=====
MySQL
=====

Resetting Root Password
-----------------------

/etc/init.d/mysqld stop
mysqld_safe --skip-grant-tables &
mysql -u root
mysql> use mysql;
mysql> update user set password=PASSWORD("newrootpassword") where User='root';
mysql> flush privileges;
mysql> quit
/etc/init.d/mysqld stop
/etc/init.d/mysqld start

Using SSH to Import Database
----------------------------

The file must be in .sql format. It can not be compressed in a .zip or .tar.gz file.
4. Upload the SQL file to the server.
5. If the database does not exist please create one with an user. Note the username and password.
6. Log into the server through SSH
7. Navigate to the directory where your .sql file is.
9. Type this this command:
mysql -p -u username database_name < file.sql
