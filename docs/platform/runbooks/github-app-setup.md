# GitHub App Setup for Flux

The admin-backend GitRepository uses GitHub App authentication instead of SSH deploy keys.

## Why GitHub App?

GitHub Apps provide:
- Fine-grained permissions per repository
- Better rate limits
- Organization-wide installation
- Audit logging
- Easier secret rotation

## Setup Steps

### 1. Create GitHub App (if not already created)

If you don't have a GitHub App yet:

1. Go to: `https://github.com/organizations/example-org/settings/apps/new`
2. Fill in the form:
   - **GitHub App name**: `Flux GitOps - Staging`
   - **Homepage URL**: `https://fluxcd.io`
   - **Webhook**: Uncheck "Active"
3. Set **Repository permissions**:
   - **Contents**: Read & Write (required for pushing commits)
   - **Metadata**: Read (automatically selected)
4. **Where can this GitHub App be installed?**: Only on this account
5. Click **Create GitHub App**

### 2. Generate Private Key

1. On your new GitHub App page, scroll to "Private keys"
2. Click **Generate a private key**
3. Save the downloaded PEM file securely

### 3. Install App on Organization

1. Go to: `https://github.com/organizations/example-org/settings/apps`
2. Click **Edit** on your app
3. Click **Install App** in the left sidebar
4. Click **Install** for the example-org organization
5. Choose:
   - **Only select repositories** → Select `admin-backend`
6. Click **Install**

### 4. Get Installation ID

After installation, note the Installation ID from the URL:
```
https://github.com/organizations/example-org/settings/installations/12345678
                                                                          ^^^^^^^^^^
                                                                          Installation ID
```

Or use the GitHub API:
```bash
# Replace with your App ID and path to private key
APP_ID="your-app-id"
PRIVATE_KEY_PATH="path/to/private-key.pem"

# Generate JWT (requires jq and openssl)
# Then call the API to get installations
```

### 5. Create Kubernetes Secret

```bash
# Set your values
APP_ID="123456"
INSTALLATION_ID="12345678"
PRIVATE_KEY_PATH="path/to/flux-github-app.pem"

# Create the secret
kubectl create secret generic admin-backend-github-app \
  --namespace=flux-system \
  --from-literal=appID="${APP_ID}" \
  --from-literal=installationID="${INSTALLATION_ID}" \
  --from-file=privateKey="${PRIVATE_KEY_PATH}"
```

### 6. Verify Secret

```bash
kubectl get secret admin-backend-github-app -n flux-system -o yaml
```

The secret should have three keys: `appID`, `installationID`, and `privateKey`.

### 7. Apply Updated GitRepository

Once the secret is created, apply the updated GitRepository manifest:

```bash
kubectl apply -f kubernetes/overlays/staging-cpt-aws/flux-system/admin-backend-gitrepository.yaml
```

### 8. Monitor Flux

```bash
# Check GitRepository status
flux get sources git -n flux-system

# Check for errors
kubectl describe gitrepository admin-backend -n flux-system
```

## Troubleshooting

### Error: "failed to get installation token"

- Verify the App ID and Installation ID are correct
- Check that the private key is in PEM format
- Ensure the app is installed on the organization with access to admin-backend repo

### Error: "403 Forbidden"

- Verify the GitHub App has **Contents: Read & Write** permission
- Reinstall the app if you changed permissions

### Error: "404 Not Found"

- Check the repository name in the GitRepository URL is correct
- Verify the app has access to the specific repository

## Security Notes

- Store the private key securely (consider using SOPS or sealed-secrets)
- Rotate the private key periodically
- Use separate GitHub Apps for different environments (staging vs prod)
- Monitor the App's activity in GitHub's audit log
