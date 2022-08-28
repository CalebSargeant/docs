Future of Kubernetes
====================

Storage
-------

* Storage and stateful workloads are harder in all sytems
* Containers make it both harder and easier than before
* **StatefulSets** is a new resource type, making Pods more sticky
* Avoid stateful workloads for fist few deployments until you're good at the basics

    * Use db-as-a-service whenever you can

Volumes
-------

* Creating and connecting Volumes: 2 types
* **Volumes**

    * Tied to lifecycle of a pod
    * All containers in a single Pod can share them

* **PersistentVolumes**

    * Created at the cluster level, outlives a Pod
    * Seperates storage config from Pod using it
    * Multiple Pods can share them

* CSI plugins are the new way to connect to storage

Ingress Controller
------------------

* None of our Service types work at OSI Layer 7 (HTTP)
* How do we route outside connections based on hostname or URL?
* Incress Controllers (optional) do this with 3rd proxy parties
* Nginx is popular, Traefik, HAProxy, F5, Envoy, Istio, etc.
* Implementation is specific to Controller chosen

Custom Resources
----------------

CRD's and The Operator Pattern
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

* YOu can add 3rd party Resources and Controllers
* THis extends Kubernetes API and CLI
* A pattern is starting to emerge of using these together
* Operator: automate deployment and management of complex apps
* e.g. Databases, monitoring tools, backups, and custom ingresses

Higher Deployment Abstractions
------------------------------

* All our `kubectl` commands just talk to the Kubernets API
* Kubernetes has limited built-in templating, versioning, tracking, and management of your apps
* There are now over 60 3rd party tools to do that , but many are defunct
* **Helm** is the most popular
* "Compose on Kubernetes" comes with Docker Desktop
* Remember these are optional, and your distro may havbe a preference
* Most distros support **Helm**

Templating YAML
^^^^^^^^^^^^^^^

* Many of the deployment tools have templating options
* You'll need a solution as the number of environments/apps grow
* **Helm** was the first "winner" in this space, but can be complex
* Official **Kustomize** feature works out-of-the-box (as of 1.14)
* `docker app` and compose-on-kubernetes are Docker's way

Kubernetes Dashboard
--------------------

* Default GUI for "upstream" Kubernetes

    * github.com/Kubernetes/dashboard

* Some distributions have their own GUI (Rancher, Docker Ent, OpenShift)
* Clouds dont have it by default
* Let's you view resources and upload YAML
* Safety first!

Namespaces and Context
----------------------

* Namespaces limit scope, aka "virtual clusters"
* Not related to Docker/Linux namespaces
* Won't need them in small clusters
* There are some built-in, to hide system stuff from `kubectl` "users"

    * `kubectl get namespaces`
    * `kubectl get all --all-namespaces`

* Context changes `kubectl` cluster and namespace
* See ~/.kube/config file
* `kubectl config get-contexts`
* `kubectl config set*`

Future of Kubernetes
--------------------

* More focus on stability and security

    * 1.14, 1.15, largely dull releases (good thing)
    * Recent security audit has created backlog

* Clearing away deprecated features like kubectl run generators
* Improving features like server-side dry-run
* More and improved Operators
* Helm 3.0 (easier deployment, chart repos, libs)
* More declarative-style features
* Better Windows Server support
* More edge cases, kubeadm HA clusters

Related Projects
^^^^^^^^^^^^^^^^

* Kubernetes has become "differencing and scheduling engin backbone" for so many new projects
* Knative - Serverless workloads on Kubernetes
* k3s - mini, simple Kubernetes
* k3OS - Minimal Linux OS for k3s
* Service Mesh - New layer in distributed app traffic for better control, security and monitoring


