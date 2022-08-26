Moving to Declarative YAML
==========================

kubectl apply
-------------

* Remember the three management approaches?
* Let's skip to full Declarative objects
* `kubectl apply -f filename.yml`
* Why skip `kubectl create`, `kubectl replace`, `kubectl edit`?
* What I recommend is not equal to all thats possible

Using kubectl apply
^^^^^^^^^^^^^^^^^^^

* Create/update resources in a file

    * `kubectl apply -f myfile.yaml`

* Create/update a whole directory of yaml

    * `kubectl apply -f myyaml/`

* Create/update from a URL

    * `kubectl apply -f https://bret.run/pod.yml`

* Be careful, lets look at it first (browser or curl)

    * `curl -L https://bret.run/pod`

Kubernetes Configuration YAML
-----------------------------

* Kubernetes config file (YAML or JSON)
* Each file contains one or more manifests
* Each manifest describes an API object (deployment, job, secret)
* Each manifest needs four parts (root key:values in the file)

    * apiVersion
    * kind
    * metadata
    * spec

Building your YAML Files
------------------------

* **kind:** We can get a list of resources the cluster supports

    * `kubectl api-resources`

* Notice some resoucres have multiple APIs (old vs new)
* **apiVersion** We can get the API versions the cluster supports

    * `kubectl api-versions`

* **metadata:** only name is required
* **spec:** Where all the action is at!

Building your YAML spec
-----------------------

* We can get all the keys each **kind** supports

    * `kubectl explain services --recursive`
    * `kubectl explain services.spec`
    * `kubectl explain services.spec.type`
    