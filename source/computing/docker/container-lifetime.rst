Container Lifetime & Persistent Data
====================================

* Containers are usually immuitable and ephemeral
* "immutable infrastructure": Only re-deploy containers, never change
* This is the ideal scenario, but what about databases or unique data?
* DOcker gives us features to ensure these "seperation of concerns"
* This is known as persistent data
* Two ways: Volumes and Bind Mounts
* Volumes: make special location outside of container UFS
* Bind Mounts: link container path to host path

Data Volumes
------------

* VOLUME command in Dockerfile

Bind Mounting
-------------

* Maps a host file or directory to a container file or directory
* Basically just two locations pointing to the same file(s)
* Again, skip UFS, and host files overwrite any in container
* Can't use in Dockerfile, must be at `container run`
* `... run -v /Users/caleb/stuff:/path/container`

