Kubernetes Management Techniques
================================

Run, Expose, and Create Generators
----------------------------------

* These commands use helper templates called "generators"
* Every resource in kubernetes has a specification or "spec"

    * `kubectl create deployment sample --image nginx --dry-run -o yaml`

* You can output those templates with `--dry-run -o yaml`
* You can use those YAML defaults as a starting point
* Generators are "opinionated defaults"

Generator Examples
^^^^^^^^^^^^^^^^^^

* Using dry-run