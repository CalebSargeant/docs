# RDS Snapshot Export to S3

Guide for exporting RDS database snapshots (full or partial) to Amazon S3.

## Prerequisites

- AWS CLI configured with appropriate credentials
- IAM role: `rds-s3-export-role` (already created)
- KMS key: `arn:aws:kms:af-south-1:<AWS-ACCOUNT-ID>:key/1a2b3c4d-1111-2222-3333-444455556666`
- S3 bucket: `example-prod-backups`

## List Available Snapshots

### List all RDS snapshots
```bash
aws rds describe-db-snapshots \
  --region af-south-1 \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table
```

### List snapshots for a specific database
```bash
aws rds describe-db-snapshots \
  --db-instance-identifier prod-rds-instance \
  --region af-south-1 \
  --query 'DBSnapshots[*].[DBSnapshotIdentifier,SnapshotCreateTime,Status]' \
  --output table
```

### Get snapshot details
```bash
aws rds describe-db-snapshots \
  --db-snapshot-identifier <snapshot-name> \
  --region af-south-1
```

## Export Snapshot to S3

### Export entire database snapshot
```bash
aws rds start-export-task \
  --export-task-identifier full-export-$(date +%Y%m%d-%H%M%S) \
  --source-arn arn:aws:rds:af-south-1:<AWS-ACCOUNT-ID>:snapshot:rds:<SNAPSHOT-NAME> \
  --s3-bucket-name example-prod-backups \
  --s3-prefix rds-exports/full-backup/ \
  --iam-role-arn arn:aws:iam::<AWS-ACCOUNT-ID>:role/rds-s3-export-role \
  --kms-key-id arn:aws:kms:af-south-1:<AWS-ACCOUNT-ID>:key/1a2b3c4d-1111-2222-3333-444455556666 \
  --region af-south-1
```

### Export specific table only (partial export)
```bash
aws rds start-export-task \
  --export-task-identifier camera-profile-export-$(date +%Y%m%d-%H%M%S) \
  --source-arn arn:aws:rds:af-south-1:<AWS-ACCOUNT-ID>:snapshot:rds:<SNAPSHOT-NAME> \
  --s3-bucket-name example-prod-backups \
  --s3-prefix rds-exports/camera-profile/ \
  --iam-role-arn arn:aws:iam::<AWS-ACCOUNT-ID>:role/rds-s3-export-role \
  --kms-key-id arn:aws:kms:af-south-1:<AWS-ACCOUNT-ID>:key/1a2b3c4d-1111-2222-3333-444455556666 \
  --export-only capture_admin_portal.camera_profile \
  --region af-south-1
```

**Note:** For partial exports, use the format `database_name.table_name` in the `--export-only` parameter. Multiple tables can be specified space-separated:
```bash
--export-only capture_admin_portal.camera_profile capture_admin_portal.camera_logs
```

## Monitor Export Status

### Check export task status
```bash
aws rds describe-export-tasks \
  --export-task-identifier camera-profile-export-20260120-152352 \
  --region af-south-1
```

### List all export tasks
```bash
aws rds describe-export-tasks \
  --region af-south-1 \
  --query 'ExportTasks[*].[ExportTaskIdentifier,Status,PercentProgress,SnapshotTime]' \
  --output table
```

### Monitor progress continuously
```bash
watch -n 30 'aws rds describe-export-tasks \
  --export-task-identifier camera-profile-export-20260120-152352 \
  --region af-south-1 \
  --query "ExportTasks[0].[Status,PercentProgress]" \
  --output text'
```

## Access Exported Data

### List exported files in S3
```bash
aws s3 ls s3://example-prod-backups/rds-exports/camera-profile/ --recursive --region af-south-1
```

### Download exported data
```bash
aws s3 sync s3://example-prod-backups/rds-exports/camera-profile/ ./local-export/ --region af-south-1
```

### Export format
Exported data is stored in **Apache Parquet format** with the following structure:
```text
s3://example-prod-backups/rds-exports/camera-profile/
├── export.json                                    # Metadata about the export
└── capture_admin_portal/
    └── camera_profile/
        ├── <partition-1>.parquet
        ├── <partition-2>.parquet
        └── ...
```

## Query Exported Data with Athena

You can query the exported Parquet files directly using AWS Athena without downloading them.

### Create Athena database
```sql
CREATE DATABASE IF NOT EXISTS rds_exports;
```

### Create external table pointing to export
```sql
CREATE EXTERNAL TABLE rds_exports.camera_profile (
  -- Define your table schema here based on camera_profile structure
  id INT,
  name STRING,
  -- ... other columns
)
STORED AS PARQUET
LOCATION 's3://example-prod-backups/rds-exports/camera-profile/capture_admin_portal/camera_profile/';
```

### Query the data
```sql
SELECT * FROM rds_exports.camera_profile LIMIT 10;
```

## Troubleshooting

### Export task fails
Check export task details for error message:
```bash
aws rds describe-export-tasks \
  --export-task-identifier <task-id> \
  --region af-south-1 \
  --query 'ExportTasks[0].[Status,FailureCause]'
```

### IAM permission issues
If you see `IamRoleMissingPermissions` errors, verify the IAM role and bucket policy are correctly configured:

```bash
# Check IAM role policy
aws iam get-role-policy \
  --role-name rds-s3-export-role \
  --policy-name rds-export-permissions

# Check S3 bucket policy
aws s3api get-bucket-policy \
  --bucket example-prod-backups \
  --region af-south-1
```

### KMS key access issues
Verify the KMS key is enabled and accessible:
```bash
aws kms describe-key \
  --key-id 1a2b3c4d-1111-2222-3333-444455556666 \
  --region af-south-1
```

## Cleanup

### Cancel running export task
```bash
aws rds cancel-export-task \
  --export-task-identifier <task-id> \
  --region af-south-1
```

### Delete exported files from S3
```bash
aws s3 rm s3://example-prod-backups/rds-exports/camera-profile/ --recursive --region af-south-1
```

## Notes

- Export tasks can take several hours depending on data size
- Exported data is encrypted using the specified KMS key
- Export costs include S3 storage and data transfer charges
- Snapshots must be in `available` state to be exported
- Maximum export task duration: 24 hours
