Docker Compose
==============

* Why: configure relationships between containes
* Why: save our docker container run settings in easy-to-read file
* Why: create one-liner developer environment startups
* Comprised of 2 seperate but related things

    1. YAML-formatted file that describes our solution options for:

        * containers
        * networks
        * volumes

    2. A CLI tool `docker-compose` used for local dev/test automation with those YAML files

docker-compose.yml
------------------

* Compose YAML format has it's own versions: 1, 2, 2.1, 3, 3.1
* YAML file can be used with `docker-compose` command for local docker automation or...
* With `docker` directly in production with Swarm (as of v1.13)
* `docker-compose --help`
* `docker-compose.yml` is default filename, but any can be used with `docker-compose -f`

docker-compose CLI
------------------

* CLI tool comes with Docker for WIndows/Mac, but separate download for Linux
* Not a production-grade tool but ideal for local development and test
* Two most common commands are

    * `docker-compose up` - setup volumes/networks and start all containers
    * `docker-compose down` - stop all containers and remove cont/vol/net

* If all your projects had a `Dockerfile` and `docker-compose.yml` then "new developer onboarding" would be:

    * `git clone github.com/some/software`
    * `docker-compose up`

Use Compose to Build
--------------------

* Compose can also build your custom images
* WIll build them with `docker-compose up` if not found in cache
* Also rebuild with `docker-compose build`
* Great for complex builds that have lots of vars or build args

