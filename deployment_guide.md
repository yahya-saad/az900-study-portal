# 🚀 AZ-900 Study Portal Free Deployment Guide

Since this application is a **Client-Side Single Page Application (SPA)** that fetches `data/questions.json` statically, **it does not require a running Node.js backend server in production**. 

The Node.js server (`server.js`) is only used locally to prevent browser security policies (CORS) from blocking file loads on `file://`. When hosted on the web, files are requested over `https://` from the same host, which is fully supported by all static host providers.

Below are the three easiest, fastest, and **100% free** ways to deploy the AZ-900 Study Portal.

---

## Option 1: Vercel (Recommended - Fastest & Easiest)
Vercel is an extremely popular hosting platform with built-in HTTPS, custom domains, and instant global deployments.

### Method A: Drag & Drop (Zero Commands)
1. Go to **[Vercel Deploy](https://vercel.com/deploy)** and log in or create a free account.
2. Drag and drop your `az-900 study app` project directory directly into the Vercel dashboard.
3. Your portal will be live in seconds with an active `https://` URL!

### Method B: Vercel CLI (From Terminal)
1. Open PowerShell / Command Prompt in your project directory and install Vercel CLI:
   ```bash
   npm install -g vercel
   ```
2. Run the deployment command:
   ```bash
   vercel
   ```
3. Follow the quick prompts (log in if needed, select default answers).
4. Run `vercel --prod` to deploy to production.

---

## Option 2: Netlify (Easiest Drag & Drop)
Netlify provides free global static hosting with instant deploy previews.

### Method: Drag & Drop
1. Go to the **[Netlify Drop Dashboard](https://app.netlify.com/drop)** (no login required to start!).
2. Drag your `az-900 study app` workspace folder and drop it into the upload box on the website.
3. Netlify will build and serve your app instantly. You can create a free account to keep the link active indefinitely and assign a custom site name.

---

## Option 3: GitHub Pages (Best for Code Version Control)
If you track your project with a GitHub repository, you can host it directly on GitHub.

1. Create a public repository on GitHub (e.g. `az-900-portal`).
2. Push your project code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit of study app"
   git remote add origin https://github.com/YOUR_USERNAME/az-900-portal.git
   git branch -M main
   git push -u origin main
   ```
3. On your GitHub repository webpage, go to **Settings** -> **Pages** (under Code and automation).
4. Under **Build and deployment** -> **Source**, select **GitHub Actions** (instead of Deploy from a branch).
5. The workflow at `.github/workflows/deploy.yml` will trigger automatically, run the Node parser to compile the database, and publish your pages!
6. Within a minute, your portal will be live at `https://YOUR_USERNAME.github.io/az-900-portal/`!

---

## 🛠️ Post-Deployment Configurations

### Custom Domains (Optional)
All three services (Vercel, Netlify, GitHub Pages) allow you to bind a custom domain (e.g. `az900.yourname.com`) for free. Instructions are available inside the settings tab of each respective dashboard.

### Updates
Whenever you add or modify questions in `data/data.md`:
1. Compile the dataset locally:
   ```bash
   node data/parse_data.js
   ```
2. If using GitHub, simply commit and push the updated `data/questions.json`:
   ```bash
   git add data/questions.json
   git commit -m "update questions database"
   git push
   ```
   Both Vercel, Netlify, and GitHub Pages will auto-detect the commit and rebuild the live website automatically!
3. If using drag-and-drop, simply drop the project folder again to overwrite.
