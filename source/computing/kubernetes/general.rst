General
=======



A Kubernetes deployment is a tier/micro-service of an application. The deployment isn't a container. A Kubernetes pod is an atomic unit of work and everything it takes to run a deployment. It could be one or more containers per pod.

.. code-block:: bash

  # View Kubernetes deployments
  kubectl get deployments

  # Show the running instances in a wide overview
  kubectl get pods -o wide

  # Show the load-balancers that give access
  kubectl get services

  # Show the clustered nodes
  kubectl get nodes

  # Get the IP Addresses of nodes
  kubectl -n nodename get pods -o wide

  # Move an application (change annotation)
  kubectl -n nodename annotate pod podname example.com/endpoint-group='{"tenant":"tenantname","app-profile":"approfilename","name":"applicationname"}' --overwrite