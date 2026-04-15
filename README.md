# STR Copilot - Deployment Guide

This application is configured for deployment on **Vercel**, **Google Cloud Run**, and **GitHub**.

## 🚀 Deployment Options

### 1. Vercel (Recommended for Frontend)
Vercel is the easiest way to deploy this React/Vite application.
- Connect your GitHub repository to Vercel.
- Vercel will automatically detect the Vite project.
- Add the environment variables listed in `.env.example` to the Vercel project settings.
- The `vercel.json` file ensures that SPA routing works correctly (all paths redirect to `index.html`).

### 2. Google Cloud Run (Containerized)
For a more robust, containerized deployment:
- Build the Docker image: `docker build -t str-copilot .`
- Push to Google Container Registry or Artifact Registry.
- Deploy to Cloud Run:
  ```bash
  gcloud run deploy str-copilot --image gcr.io/[PROJECT_ID]/str-copilot --platform managed
  ```
- Ensure you set the environment variables in the Cloud Run service configuration.
- The app listens on port `8080` inside the container.

### 3. GitHub Actions (CI/CD)
You can automate deployments using GitHub Actions. Create a `.github/workflows/deploy.yml` file to trigger builds on every push.

## 🔑 Configuration

You must provide your Firebase and Gemini credentials via environment variables. See `.env.example` for the full list.

| Variable | Description |
| --- | --- |
| `GEMINI_API_KEY` | Your Google Gemini API Key |
| `VITE_FIREBASE_*` | Your Firebase project configuration |

## 🛠 Local Development

1. Install dependencies: `npm install`
2. Start dev server: `npm run dev`
3. Build for production: `npm run build`
