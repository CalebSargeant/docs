######
iPerf3
######

brew install iperf3
brew install gnuplot
brew install jq

### https://iperf.fr/iperf-servers.php
# bouygues.iperf.fr
# 9200 - 9222
route outside3 89.84.1.222 255.255.255.255 129.205.142.73 1

# ping.online.net
# 5200 - 5209
route outside3 45.33.39.39 255.255.255.255 129.205.142.73 1

# speedtest.serverius.net
# 5002
route outside3 178.21.16.76 255.255.255.255 129.205.142.73 1

# iperf.eenet.ee
# 5201
route outside3 193.40.55.7 255.255.255.255 129.205.142.73 1

# iperf.viola.net
# 5201
route outside3 77.120.3.236 255.255.255.255 129.205.142.73 1

# iperf.it-north.net
# 5200 - 5209
route outside3 208.100.26.250 255.255.255.255 129.205.142.73 1

# iperf.biznetnetworks.com
# 5201 - 5203
route outside3 117.102.109.186 255.255.255.255 129.205.142.73 1

# iperf.scottlinux.com
# 5201
route outside3 62.210.18.40 255.255.255.255 129.205.142.73 1

# iperf.he.net
# 5201
route outside3 216.218.207.42 255.255.255.255 129.205.142.73 1



git clone https://github.com/kaihendry/iperf3chart.git
