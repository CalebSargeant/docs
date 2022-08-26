Buildng your YAML Spec
----------------------

* We can get all the keys each **kind** supports

    * `kubectl explain services --recursive`
    * `kubectl explain services.spec`

* We can walk through the spec this way

    * `kubectl explain services.spec.type`

* spec: can have sub spect: of other resources

    * `kubectl explain deployment.spec.template.spec.volumes.nfs.server`

* We can also use docs

    * kubernetes.io/docs/reference/#api-reference

Dry Runs and Diffs
------------------

* dry-run a create (client side only)

    * `kubectl apply -f app.yml --dry-run`

* dry-run a create/update on server

    * `kubectl apply -f app.yml --server-dry-run`

    