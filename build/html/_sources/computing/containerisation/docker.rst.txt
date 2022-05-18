Docker
======

A docker image is like a template. A docker container is a running instance of the template. Each micro-service, or application, is placed in their own container.

.. code-block:: bash

  ## Manually installing docker
  # https://docs.docker.com/engine/install/debian/#install-using-the-convenience-script
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker ubuntu

  # log out and back in

  # Show docker processes running
  docker ps

  # Install docker
  apt install docker.io

  # Create Ubuntu docker container (with custom name, not generated)
  docker run -it --name my-linux-container ubuntu bash

  # List all downloaded docker images
  docker images

  # Show all running docker processes
  docker ps -a

  # Delete all exited containers
  docker rm $(docker ps -a -f status=exited -q)

  # Create Ubuntu docker container, mounting local data as a docker volume (add --rm to delete container once exited)
  docker run -it --name my-linux-container -v /local/data/location:/remote/data/location ubuntu bash

  # Build your own container (. referrs to Dockerfile in current location)
  nano Dockerfile
    FROM ubuntu
    CMD echo "hello world"
    RUN apt-get update && apt-get update && apt-get install -y python3
  docker build -t my-ubuntu-image .

  # List images again
  docker images

  # Run newly created docker image
  docker run -it my-ubuntu-image

  # Delete everything docker (be extremely careful you can loose all data!)
  docker system prune -f --all

  # Good guide to start/stop/delete/list docker stuff
  https://linuxize.com/post/how-to-remove-docker-images-containers-volumes-and-networks/

  # Go into bash
  sudo docker exec -it 5dc64253e9b0 bash

  # Restart container
  sudo docker container restart 5dc64253e9b0

  # Re-compose
  cd /etc/docker/owncloud/
  sudo docker-compose up -d

  # STOP AND DELETE EVERYTHING - BE EXTTEMELY CAREFUL
  docker container stop $(docker container ls -aq)
  docker container rm $(docker container ls -aq)

  # Updating Images
  docker stop containername
  docker rm containername
  docker pull image/name
  # deploy container again via compose/ansible/whatever

  # https://stackoverflow.com/questions/44678725/cannot-connect-to-the-docker-daemon-at-unix-var-run-docker-sock-is-the-docker
  # Cannot connect to the Docker daemon at unix:/var/run/docker.sock. Is the docker daemon running?
  rm /var/snap/docker/<your-version-number>/run/docker.pid
  snap stop docker
  snap start docker

Backup
------

https://stackoverflow.com/questions/26331651/how-can-i-backup-a-docker-container-with-its-data-volumes

.. code-block:: bash

  #!/bin/bash

  DATE=$(date +%Y%m%d)
  filelist="prometheus blackbox pushgateway grafana alertmanager"

  # Create /root/backups where containers will be saved to
  /usr/bin/mkdir /root/backups

  # Stop docker containers and export
  for line in $filelist ; do
      /usr/bin/docker stop "$line"
      /usr/bin/docker export -o "/root/backups/docker-container-$line" "$line"
  done

  # Make tarball of all volumes, containers and config
  /usr/bin/tar -czvf "/root/$DATE-backup-weekly.tar.gz" /usr/local/bin /var/lib/docker/volumes /var/spool/cron /etc /root/backups

  # Start docker containers
  for line in $filelist ; do
      /usr/bin/docker start "$line"
  done

  # Copy to backups
  /usr/bin/scp "/root/$DATE-backup-weekly.tar.gz" serveradmin@backups.chatinc.com:/mnt/data/monitor/weekly

  # Remove backups locally
  /usr/bin/rm -f "/root/$DATE-backup-weekly.tar.gz"
  /usr/bin/rm -rf "/root/backups/"

Docker Swarm
------------

.. code-block:: bash

  ### Manager
  # Initialise docker swarm
  docker swarm init --advertise-addr 10.0.2.11

  # List all nodes in swarm
  docker node ls

  # Create docker service (--mode global makes service available across swarm)
  docker service create --name helloworld --mode global alpine ping docker.com

  # List all docker services
  docker service ls

  # List docker containers
  docker ps

  ### Worker
  # Join the docker swarm (token generated from swarm init on manager)
  docker swarm join --token

  # To leave a swarm
  docker swarm leave --force
