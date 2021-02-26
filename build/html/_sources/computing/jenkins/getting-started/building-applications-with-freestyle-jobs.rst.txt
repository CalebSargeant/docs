Building Applications with Freestyle Jobs
=========================================

Anatomy of the Build
--------------------

- Git repo

  - Compile
  - Test
  - Package
  - Clean
  - rinse & repeat

Manually Building with Maven and Running App
--------------------------------------------

.. code-block:: bash

   git clone git@github.com:CalebSargeant/jgsu-spring-petclinic.git --config core.sshCommand="ssh -i ~/.ssh/github"
   cd jgsu-spring-petclinic
   ./mvnw compile
   ./mvnw test
   ./mvnw package
   java -jar target/spring-petclinic-2.3.1.BUILD-SNAPSHOT.jar

Packaging an App in Jenkins
---------------------------

.. note::

	Workspaces are temporary!

.. figure:: _images/jenkins-6.png

  Give your item a name

.. figure:: _images/jenkins-7.png

  Input the repo url, ensure branch is correct (main vs master)

.. figure:: _images/jenkins-8.png

  To build a project, click Build now

.. figure:: _images/jenkins-9.png

  You can use ``mvnw`` commands for building

.. figure:: _images/jenkins-10.png

  We'll want to package our app, also exclude ``*.jar`` from being deleted

.. figure:: _images/jenkins-11.png

  You can configure test reports from the xml files

.. figure:: _images/jenkins-12.png

  Checking the health status of a build

.. figure:: _images/jenkins-13.png

  Configuring polling git for changes to code to build automatically

.. figure:: _images/jenkins-14.png

  You can check the recent changes of a build and drill down into git diffs
