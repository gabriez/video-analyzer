# Automated Deployment to Proxmox VM / LXC

This document outlines the deployment workflow for running `video-analyzer` on a Proxmox VM.

---

## 1. Overview

The deployment is simple, minimal, and fully automated via GitHub Actions:

```text
[ Push to main ]
       │
       ▼
[ GitHub Actions ]
  ├── 1. Run quality checks (tests, type-check, biome)
  ├── 2. Build & push Docker image to ghcr.io
  └── 3. Deploy over SSH to Proxmox VM:
         ├── Sync docker-compose.yml
         ├── Dump PROD_ENV secret directly into .env (chmod 600)
         ├── docker compose pull
         ├── docker compose up -d --remove-orphans
         └── docker image prune -f
```

The VM is 100% agnostic to your environment variables. It receives `.env` directly from your GitHub Secret `PROD_ENV`.

---

## 2. GitHub Secrets Configuration

Add these secrets in GitHub under **Settings > Secrets and variables > Actions > Secrets**:

| Secret Name           | Description                                              | Example                                  |
| --------------------- | -------------------------------------------------------- | ---------------------------------------- |
| `PROXMOX_HOST`        | IP or domain of your Proxmox VM                          | `192.168.1.150`                          |
| `PROXMOX_USER`        | Deploy user on the VM                                    | `deploy`                                 |
| `PROXMOX_VM_SSH_KEY`     | Private SSH key for the user                             | `-----BEGIN OPENSSH PRIVATE KEY-----...` |
| `PROD_ENV`            | Full content of your production `.env` file              | _(Paste raw .env content here)_          |
| `PROXMOX_SSH_PORT`    | _(Optional, default: 22)_                                | `22`                                     |
| `PROXMOX_DEPLOY_PATH` | _(Optional, default: `/opt/video-analyzer`)_             | `/opt/video-analyzer`                    |
| `DEPLOY_GHCR_PAT`     | _(Optional)_ PAT with `read:packages` if repo is private | `ghp_...`                                |

### Example for `PROD_ENV` secret:

Copy and paste your production variables directly into the value of `PROD_ENV`:

```env
APP_PORT=3001
SPEACHES_PORT=8000
API_BEARER_TOKEN=your-api-secret-token
OPENROUTER_API_KEY=sk-or-v1-your-key
OPENROUTER_MODEL=google/gemini-2.5-flash
WHISPER_URL=http://speaches:8000/v1
WHISPER_MODEL=Systran/faster-whisper-small
WEBHOOK_URL=https://n8n.yourdomain.com/webhook/video-processed
WEBHOOK_AUTH_HEADER=X-N8N-Webhook-Token
WEBHOOK_AUTH_TOKEN=your-webhook-secret
MAX_CONCURRENT_JOBS=3
DB_LOGGING=false
```

---

## 3. Minimal Proxmox VM Provisioning

Run once on the VM:

```bash
# 1. Install Docker & Compose plugin
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 2. Create deploy user
sudo useradd -m -s /bin/bash deploy
sudo usermod -aG docker deploy
sudo mkdir -p /opt/video-analyzer
sudo chown -R deploy:deploy /opt/video-analyzer

# 3. Add deploy SSH public key
sudo -u deploy mkdir -p /home/deploy/.ssh
sudo -u deploy chmod 700 /home/deploy/.ssh
echo "ssh-ed25519 AAAAC3... deploy-key" | sudo -u deploy tee -a /home/deploy/.ssh/authorized_keys
sudo -u deploy chmod 600 /home/deploy/.ssh/authorized_keys
```

That's it. Every push to `main` will automatically build the image, inject `.env` from `PROD_ENV`, and deploy cleanly.
