Infrastructure as a Code
========================

Infrastructure as a Code Defined
--------------------------------

Provisioning infrastructure through software to achieve consistent and predictable environments

Core Concepts
^^^^^^^^^^^^^

- Defined in code
- Stored in source control
- Declarative or imperative
- Idempotent and consistent
- Push or pull

Declarative vs Imperative
-------------------------

Terraform is a declarative approach to deploying infrastructure as code

.. code-block:: none

  # Make me a taco
  food taco "bean-taco" {
    ingredients = [
      "beans", "cheese", "lettace", "salsa"
    ]
  }

Idempotence and Consistency
---------------------------

If you haven't changed anything about your configuration and you apply it again to the same environment, nothing will change in the environment, because your defined configuration matches the reality of the infrastructure that exists.

Push or Pull
------------

Terraform is a push-type model, the configuration that terraform has is getting pushed to the target environment.

IaC Benefits
------------

- Automated deployment
- Consistent environment
- Repeatable process
- Reusable components
- Documented architecture
