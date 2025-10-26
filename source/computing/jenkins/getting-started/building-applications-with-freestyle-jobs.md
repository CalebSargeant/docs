# Building Applications with Freestyle Jobs

## Anatomy of the Build

-   Git repo
    -   Compile
    -   Test
    -   Package
    -   Clean
    -   rinse & repeat

## Manually Building with Maven and Running App

``` bash
git clone git@github.com:CalebSargeant/jgsu-spring-petclinic.git --config core.sshCommand="ssh -i ~/.ssh/github"
cd jgsu-spring-petclinic
./mvnw compile
./mvnw test
./mvnw package
java -jar target/spring-petclinic-2.3.1.BUILD-SNAPSHOT.jar
```

## Packaging an App in Jenkins

::: note
::: title
Note
:::

Workspaces are temporary!
:::

<figure>
<img src="_images/jenkins-6.png" alt="_images/jenkins-6.png" />
<figcaption>Give your item a name</figcaption>
</figure>

<figure>
<img src="_images/jenkins-7.png" alt="_images/jenkins-7.png" />
<figcaption>Input the repo url, ensure branch is correct (main vs
master)</figcaption>
</figure>

<figure>
<img src="_images/jenkins-8.png" alt="_images/jenkins-8.png" />
<figcaption>To build a project, click Build now</figcaption>
</figure>

<figure>
<img src="_images/jenkins-9.png" alt="_images/jenkins-9.png" />
<figcaption>You can use <code>mvnw</code> commands for
building</figcaption>
</figure>

<figure>
<img src="_images/jenkins-10.png" alt="_images/jenkins-10.png" />
<figcaption>We'll want to package our app, also exclude
<code>*.jar</code> from being deleted</figcaption>
</figure>

<figure>
<img src="_images/jenkins-11.png" alt="_images/jenkins-11.png" />
<figcaption>You can configure test reports from the xml
files</figcaption>
</figure>

<figure>
<img src="_images/jenkins-12.png" alt="_images/jenkins-12.png" />
<figcaption>Checking the health status of a build</figcaption>
</figure>

<figure>
<img src="_images/jenkins-13.png" alt="_images/jenkins-13.png" />
<figcaption>Configuring polling git for changes to code to build
automatically</figcaption>
</figure>

<figure>
<img src="_images/jenkins-14.png" alt="_images/jenkins-14.png" />
<figcaption>You can check the recent changes of a build and drill down
into git diffs</figcaption>
</figure>
