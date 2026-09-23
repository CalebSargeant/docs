# EKS Node Disk Cleanup Procedure

## Overview

This procedure safely cleans up disk space on EKS nodes without disrupting running workloads. It targets log files, journal data, and unused container images.

## When to Use

- Node disk usage exceeds 70-80%
- Monitoring alerts indicate low disk space
- Preventative maintenance (quarterly recommended)

## Safety Notes

- ⚠️ **Always perform on one node at a time** to maintain cluster availability
- All operations are safe for production nodes
- No running pods or containers are affected
- Log data is truncated, not deleted (preserves file handles)

## Cleanup Results

**Example from prod-eks2 (January 2026):**
- **Before**: 50G total, 19G used, 10G available (37% usage)
- **After**: 50G total, 12G used, 39G available (23% usage)
- **Freed**: 7GB of disk space

## Prerequisites

```bash
# Ensure you have SSH access to the node
ssh <node-hostname>

# Verify current disk usage
df -h /
```

## Cleanup Procedure

### Step 1: Truncate Large Log Files

Truncate (don't delete) large log files to preserve file handles for running processes:

```bash
# Find and truncate logs larger than 100MB
sudo find /var/log -type f -size +100M -exec truncate -s 0 {} \; -print

# Check specific log directories
sudo du -sh /var/log/* | sort -rh | head -10
```

**Why truncate instead of delete?**
- Preserves file handles for running processes
- Prevents "No such file" errors in active logging
- Safer for production systems

### Step 2: Remove Archived/Rotated Logs

Delete compressed and old rotated logs:

```bash
# Remove gzipped log archives
sudo find /var/log -type f -name "*.gz" -delete

# Remove old numbered logs (e.g., messages.1, messages.2)
sudo find /var/log -type f -name "*.1" -o -name "*.2" -o -name "*.3" | sudo xargs rm -f

# Verify removal
sudo find /var/log -name "*.gz" -o -name "*.[0-9]"
```

### Step 3: Clean Kubernetes Logs

Remove old pod and container logs:

```bash
# Clean up pod logs (older than 7 days)
sudo find /var/log/pods -type f -name "*.log" -mtime +7 -delete

# Clean up container logs
sudo find /var/log/containers -type l -mtime +7 -delete

# Truncate large current logs
sudo find /var/log/pods -type f -name "*.log" -size +100M -exec truncate -s 0 {} \; -print
```

### Step 4: Vacuum systemd Journal

Reduce systemd journal to a reasonable size:

```bash
# Limit journal to 100MB
sudo journalctl --vacuum-size=100M

# Alternative: Keep only last 7 days
sudo journalctl --vacuum-time=7d

# Verify journal size
sudo du -sh /var/log/journal/
```

### Step 5: Prune Unused Container Images

Remove unused containerd images:

```bash
# List current images (optional)
sudo crictl images

# Prune unused images
sudo crictl rmi --prune

# Verify remaining images
sudo crictl images | wc -l
```

**Note**: This only removes images not currently in use by any pod.

### Step 6: Verify Results

```bash
# Check final disk usage
df -h /

# Check inode usage (should also be healthy)
df -i /

# Verify containerd content size
sudo du -sh /var/lib/containerd/io.containerd.content.v1.content/

# Check largest directories
sudo du -sh /var/log/* /var/lib/* | sort -rh | head -20
```

## Quick One-Liner Script

For convenience, all steps in one command:

```bash
ssh <node-hostname> 'sudo bash -s' << 'EOF'
echo "=== Disk usage before cleanup ==="
df -h /
echo

echo "=== Truncating large logs ==="
find /var/log -type f -size +100M -exec truncate -s 0 {} \; -print

echo "=== Removing archived logs ==="
find /var/log -type f \( -name "*.gz" -o -name "*.[0-9]" \) -delete

echo "=== Cleaning Kubernetes logs ==="
find /var/log/pods -type f -name "*.log" -mtime +7 -delete
find /var/log/containers -type l -mtime +7 -delete

echo "=== Vacuuming journal ==="
journalctl --vacuum-size=100M

echo "=== Pruning unused images ==="
crictl rmi --prune

echo
echo "=== Disk usage after cleanup ==="
df -h /
EOF
```

## Monitoring Disk Usage

### Check All Nodes

Use kubectl to check disk usage across all nodes:

```bash
# View node disk pressure status
kubectl get nodes -o wide

# Describe nodes for detailed disk metrics
kubectl describe nodes | grep -A 5 "Allocated resources"

# Check specific node conditions
kubectl describe node <node-name> | grep -A 10 Conditions
```

### CloudWatch Metrics (AWS)

Monitor disk usage via CloudWatch:
- **Metric**: `node_filesystem_avail_bytes` / `node_filesystem_size_bytes`
- **Alarm Threshold**: < 20% available
- **Dashboard**: EC2 > Instances > Monitoring

## Automation Considerations

### Cron Job on Nodes (Not Recommended)

While possible, running cleanup via cron on individual nodes is not recommended:
- Breaks infrastructure-as-code principles
- Hard to maintain across fleet
- No centralized logging/alerting

### Kubernetes CronJob (Recommended)

Deploy a DaemonSet with privileged access that runs periodic cleanup:
- Centralized management via GitOps
- Consistent execution across all nodes
- Kubernetes-native logging and monitoring

### Example DaemonSet Approach

```yaml
# Future enhancement: Create cleanup DaemonSet
# Location: kubernetes/base/system/disk-cleanup/
# Runs weekly, logs to CloudWatch, alerts on failures
```

## Troubleshooting

### Disk Usage Still High After Cleanup

1. **Check for large files**:
   ```bash
   sudo du -ah / | sort -rh | head -50
   ```

2. **Check for deleted files held by processes**:
   ```bash
   sudo lsof +L1 | grep deleted
   ```

3. **Restart offending processes** (if safe):
   ```bash
   sudo systemctl restart <service>
   ```

### Node Still Shows Disk Pressure

Kubernetes may take a few minutes to update node conditions:
```bash
# Wait for kubelet to detect change
kubectl describe node <node-name> | grep -A 10 Conditions
```

## Prevention

### Image Garbage Collection

Containerd automatically garbage collects unused images based on:
- **Image TTL**: Default 72 hours
- **Disk pressure**: Triggered at 85% usage

Verify kubelet configuration:
```bash
sudo cat /etc/kubernetes/kubelet/kubelet-config.json | grep -A 5 imageGC
```

### Log Rotation

Ensure logrotate is properly configured:
```bash
# Check logrotate configuration
sudo cat /etc/logrotate.d/syslog
sudo logrotate -d /etc/logrotate.d/syslog  # Dry run
```

### Right-Size Node Storage

If cleanup is frequently needed, consider:
- Increasing EBS volume size (requires node replacement)
- Adjusting pod log retention in kubelet config
- Moving verbose logging to CloudWatch/Loki

## Related Documentation

- [AWS EKS Best Practices - Node Maintenance](https://aws.github.io/aws-eks-best-practices/)
- [Kubernetes Logging Architecture](https://kubernetes.io/docs/concepts/cluster-administration/logging/)
- [containerd Image Management](https://github.com/containerd/containerd/blob/main/docs/ops.md)

## Revision History

| Date | Author | Changes |
|------|--------|---------|
| 2026-01-18 | the platform engineer | Initial procedure based on prod-eks2 cleanup |
