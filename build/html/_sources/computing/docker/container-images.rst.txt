Container Images
================

What's an Image
---------------

* App binaries and dependencies
* Metadata about the image and how to run the image
* Official definition: "An image is an ordered collection of root filesystem changes and the corresponding execution parameters for use within a container runtime"
* Not a complete OS. No kernal, kernal modules (e.g. drivers)
* Small as one file (your app binary) like golang static binary
* Big as Ubuntu distro with apt, and Apache, PHP, and more installed

Image and Their Layers
----------------------

* Images are made up of file system changes and metadata
* Each layer is uniquely identified and only stored once on a host
* THis saves storage space on host and transfer time on push/pull
* A container is just a single read/write layer on top of image
* `docker image history` and `inspect` commands can teach us

