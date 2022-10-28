Container Registries
====================

* An image registry needs to be part of your container plan
* More Docker Hub details including auto-build
* How Docker Store (store.docker.com) is different than Hub
* How Docker Cloud (cloud.docker.com) is different than Hub
* Use new Swarms feature in CLoud to connect to Mac/Win Swarm
* Install and use Docker Registry as private image store
* 3rd party registry options

Docker Registry
---------------

* A private image registry for your network
* Part of the docker/distribution GitHub repo
* The de facto in private container registries
* Not as full featured as Hub or others, no web UI, basic auth only
* At its core: a web API and storage system written in Go
* Storage supports local, S3/Azure/Alibaba/Google Cloud and OpenStack Swift
* Secure your Registry with TLS
* Storage cleanup via Garbage Collection
* Enable Hub caching via "--registry-mirror"

Private Registry
----------------

* Run the registry image on defalt port 5000
* Re-tag an existing image and push it to your new registry
* Remove that image from local cache and pull it from new registry
* Re-create registry using bind mount and see how it stores data

.. code-block:: bash

    docker container run -d -p 5000:5000 --name registry registry
    docker pull hello-world
    docker run hello-world
    docker tag hello-world 127.0.0.1:5000/hello-world
    docker push 127.0.0.1:5000/hello-world
    docker container rm hello-world
    docker image remove hello-world
    docker pull 127.0.0.1:5000/hello-world
    docker container kill registry
    docker container rm registry
    docker container run -d -p 5000:5000 --name registry -v $(pwd)/registry-data:/var/lib/registry registry
    docker push 127.0.0.1:5000/hello-world
    ls /registry-data

Registry and Proper TLS
^^^^^^^^^^^^^^^^^^^^^^^

* Secure by default: docker wont talk to registry without HTTPS
* Except localhost
* For remote self-signed TLS, enable "insecure-registry" in engine

Using Registry with Swarm
-------------------------

* Works the same way as localhost
* Because of Routing Mesh, all nodes can see 127.0.0.1:5000
* Remember to decide how to store images (volume driver)
* Note: all nodes must be able to access images
* ProTip: use hosted SaaS registry if possible

