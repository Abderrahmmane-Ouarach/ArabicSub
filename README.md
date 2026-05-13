# Arabic Subtitle Pipeline — أداة الترجمة العربية

A self-hosted, invite-only web app that transcribes Arabic video using Whisper AI,
lets you edit and style subtitles, then burns them into the final video.

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI + Python threading queue |
| AI transcription | Whisper (via stable-ts) |
| Video processing | ffmpeg |
| Containerization | Docker + docker-compose |
| Reverse proxy + Auth | Nginx + HTTP Basic Auth |
| CI/CD | GitHub Actions → SSH → EC2 |
| Server | AWS EC2 |

## Features

- Arabic RTL subtitle editor
- Style presets (Netflix, Reels, Classic)
- Live style preview
- Job queue — multiple users wait their turn, no crashes
- Invite-only access via Basic Auth
- Non-destructive back-to-edit after burn

## Deploy

### 1. One-time EC2 setup

```bash
ssh -i your-key.pem ubuntu@your-ec2-ip

sudo apt update && sudo apt install docker.io docker-compose-plugin apache2-utils -y
sudo usermod -aG docker ubuntu
# log out and back in

git clone https://github.com/your-username/arabic-subtitles.git ~/arabic-subtitles
cd ~/arabic-subtitles
```

### 2. Create user accounts

```bash
# First user (creates the file)
htpasswd -c htpasswd alice

# Add more users
htpasswd htpasswd bob
htpasswd htpasswd carol
```

### 3. First deploy

```bash
docker compose up --build -d
```

### 4. GitHub Actions CI/CD

Add these secrets to your repo (Settings → Secrets → Actions):

| Secret | Value |
|---|---|
| `EC2_HOST` | Your EC2 public IP |
| `EC2_USER` | `ubuntu` |
| `EC2_SSH_KEY` | Contents of your `.pem` file |

Every `git push origin main` deploys automatically.

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/transcribe` | Upload video → queued, returns job_id |
| GET | `/job/{job_id}` | Poll job status |
| GET | `/queue-status` | How many jobs waiting |
| GET | `/video/{job_id}` | Stream original video |
| POST | `/burn` | Queue subtitle burn |
| GET | `/download/{job_id}` | Download final video |
| GET | `/download-srt/{job_id}` | Download SRT file |

## Managing users

```bash
# Add user
htpasswd htpasswd newuser

# Remove user — edit the file manually
nano htpasswd

# No restart needed — Nginx reads it on every request
```
