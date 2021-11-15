Prometheus
==========

Installation
------------

.. code-block:: bash

    # https://www.howtoforge.com/how-to-install-prometheus-on-ubuntu-20-04/
    # https://linuxhint.com/install_prometheus_ubuntu/

    # Create Prometheus System User
    sudo useradd --no-create-home --shell /bin/false prometheus
    sudo useradd --no-create-home --shell /bin/false node_exporter

    # Create Prometheus Directories
    sudo mkdir /etc/prometheus
    sudo mkdir /var/lib/prometheus

    # Downloading and Installing Prometheus
    # https://prometheus.io/download
    wget <latest-url-here>
    tar -xvf prometheus-2.28.1.linux-amd64.tar.gz
    sudo cp prometheus-2.28.1.linux-amd64/prometheus /usr/local/bin/
    sudo cp prometheus-2.28.1.linux-amd64/promtool /usr/local/bin/
    sudo chown prometheus:prometheus /usr/local/bin/prometheus
    sudo chown prometheus:prometheus /usr/local/bin/promtool
    sudo cp -r prometheus-2.28.1.linux-amd64/consoles /etc/prometheus
    sudo cp -r prometheus-2.28.1.linux-amd64/console_libraries /etc/prometheus
    sudo chown -R prometheus:prometheus /etc/prometheus/consoles
    sudo chown -R prometheus:prometheus /etc/prometheus/console_libraries

    # Create Prometheus Configuration File
    sudo nano /etc/prometheus/prometheus.yml
        global:
         scrape_interval: 15s
        scrape_configs:
         - job_name: 'prometheus'
         scrape_interval: 5s
         static_configs:
         - targets: ['localhost:9090']

    # Create Prometheus Service
    sudo nano /etc/systemd/system/prometheus.service
        [Unit]
        Description=Prometheus
        Wants=network-online.target
        After=network-online.target

        [Service]
        User=prome
        Group=prome
        Type=simple
        ExecStart=/usr/local/bin/prometheus \
            --config.file /etc/prometheus/prometheus.yml \
            --storage.tsdb.path /var/lib/prometheus/ \
            --web.console.templates=/etc/prometheus/consoles \
            --web.console.libraries=/etc/prometheus/console_libraries

        [Install]
        WantedBy=multi-user.target
    sudo systemctl daemon-reload
    sudo systemctl enable prometheus
    sudo systemctl status prometheus

Check if Config is Valid
------------------------

https://www.robustperception.io/how-to-check-your-prometheus-yml-is-valid

.. code-block:: bash
    
    ./promtool check config prometheus.yml 
