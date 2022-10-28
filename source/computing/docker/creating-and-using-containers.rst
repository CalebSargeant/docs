Creating and Using Containers
=============================

Basic Commands
--------------

* command: `docker version`

    * verified cli can talk to engine

* command: `docker info`

    * most config values of engine

* docker command line structure

    * old (still works): `docker <command> (options)`
    * new: `docker <command> <sub-command> (options)`

Starting a Container
--------------------

Image vs Container
^^^^^^^^^^^^^^^^^^

* An image is the application we want to run
* A Container is an instance of that image running as a process
* You can have many containers running off the same image
* Docker's default image "registry" is called Docker Hub (hub.docker.com)

docker container run --publish 80:80 nginx
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

1. Download image 'nginx' from Docker Hub
2. Started new container from that image
3. Opened port 80 on the host IP
4. Routes that traffic to the container IP, port 80

What Happens When we Run a Container
------------------------------------

1. Looks for that image locally in image cache, doesnt find anything
2. Then looks in remote image repository (defaults to Docker Hub)
3. Downloads the latest version (nginx:latest by default)
4. Creates a new container based on that image and prepares start
5. Gives it a virtual IP on a private network inside docker engine
6. Opens up port 80 on host and forwards to port 80 in container
7. Starts container by using the CMD in the image Dockerfile

Container vs VM
---------------

Containers aren't Mini-VMs
^^^^^^^^^^^^^^^^^^^^^^^^^^

* THey are just processes
* Limited to what resources they can access
* Exit when process stops

Whats Going on in Containers
----------------------------

* `docker container top` - process list in on container
* `docker container inspect` -details of one container config
* `docker container stats` - performance stats for all containers

Getting a Shell inside Containers
---------------------------------

* `docker container run -it` - start new container interactively
* `docker container exec -it` - run additional command in existing container
* Different Linux distros in containers

Docker Networks
---------------

Docker Networks Defaults
^^^^^^^^^^^^^^^^^^^^^^^^

* Each container connected to a private virtual network "bridge"
* Each virtual network routes through NAT firewall on host IP
* All containers on a virtual network can talk to each other without -p
* Best practice is to create a new virtual network for each app:

    * network "my_web_app" for mysql and php/apache containers
    * network "my_api" for mongo and nodejs containers

* "Batteries included, but removeable"

    * Defaults work well in many cases, but easy to swap out parts to customize it

* Make new virtual networks
* Attach containers to more than one virtual network (or none)
* SKip virtual networks and use host IP (--net=host)
* Use different DOcker network drivers to gain new abilities

CLI Management
^^^^^^^^^^^^^^

* Show networks `docker network ls`
* Inspect a network `docker network inspect`
* Create a network `docker network create --driver`
* Attach a network to container `docker netowrk connect`
* Detach a network from container `docker network disconnect`

Default Security
^^^^^^^^^^^^^^^^

* Create your apps so frontend/backend sit on same Docker network
* Their inter-communication never leaves host
* All externally exposed ports clsoed by default
* You must manually expose via -p, which is better default security
* This gets even better with Swarm and Overlay networks

DNS
^^^

* Containers shouldnt reply on IPs for inter-communication
* DNS for friendly names is built-in if you use custom networks
* This gets way easier with Docker Compose