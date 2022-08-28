Exposing Kubernetes Ports
=========================

Service Types
-------------

Exposing Containers
^^^^^^^^^^^^^^^^^^^

* `kubectl expose` creates a **service** for existing pods
* A **service** is a stable address for pod(s)
* If we want to connect to pod(s), we need a **service**
* CoreDNS allows us to resolve **services** by name
* There are different types of **services**

    * ClusterIP
    * NodePort
    * LoadBalancer
    * ExternalName

Basic Service Types
^^^^^^^^^^^^^^^^^^^

* ClusterIP (default)

    * Single, internal virtual IP allocated
    * Only reachable from within the cluster (nodes and podes)
    * Pods can reach service on apps port number

* NodePort

    * High port allocated on each node
    * Port is open on every node's IP
    * Anyone can connect (if they can reach the node)
    * Other pods need to be updated to this port

* These services are always available in Kubernetes

More Service Types
^^^^^^^^^^^^^^^^^^

* LoadBalancer

    * Controls a LB endpoint external to the cluster
    * Only available when infra provider gives ou a LB (AWS ELB, etc)
    * Creates NodePort+ClusterIP services, tells LB to send to NodePort

* ExternalName

    * Adds CNAME DNS record to CoreDNS only
    * Not used for Pods, but for giving pods a DNS name to use for something outside Kubernetes

Creating a ClusterIP Service
----------------------------

* Open two shell windos so we can watch this

    * `kubectl get pods -w`

* In second window, lets start a simple http server using sample code

    * `kubectl create deployment httpenv --image=bretfisher/httpenv`

* Scale it to 5 replicas

    * `kubectl scale deployment/httpenv --replicas=5`

* Lets create a ClusterIP service (default)

    * `kubectl expose deployment/httpenv --port 8888`

Inspecting ClusterIP Service
^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* Look up what IP was allocated

    * `kubectl get service`

* Remember this IP is cluster internal only, how do we curl it?
* If you're on DOcker Desktop (Host OS is not container OS)

    * `kubectl run --generator=run-pod/v1 tmp-shell --rm -it --image bretfisher/netshoot -- bash`
    * `curl httpenv:8888`

* If you're on Linux host

    * curl [ip of service]:8888

Creating a NodePort and LoadBalancer Service
--------------------------------------------

Create a NodePort Service
^^^^^^^^^^^^^^^^^^^^^^^^^

* Lets expose a NodePort so we can access it via the host IP (including localhost)

    * `kubetcl expose deployment/httpenv --port 8888 -name httpenv-np --type NodePort`

* Did you know that a NodePort service also creates a ClusterIP?
* These three services are additive, each one creates the ones above it:

    * ClusterIP
    * NodePort
    * LoadBalancer

Add a LoadBalancer Service
^^^^^^^^^^^^^^^^^^^^^^^^^^

* If you're on Docker Desktop, it provides a built-in LoadBalancer that publishes the --port on localhost

    * `kubectl expose deployment/httpenv --port 8888 --name httpenv-lb --type LoadBalancer`
    * `curl localhost:8888`

* If you're on kubeadm, minikube, or microk8s

    * No built-in LB
    * You can still run the command, it'll just stay at "pending" (but its NodePort works)

Kubernetes Services DNS
-----------------------

* Starting with 1.11, internal DNS is provided by CoreDNS
* Like Swarm, this is DNS-Based Service Discovery
* So far we've been using hostnames to access services

    * `curl <hostname>`

* But that only works for Services in the same Namespace

    * `kubectl get namespaces`

* Services also have a FQDN

    * `curl <hostname>.<namespace>.svc.cluster.local`