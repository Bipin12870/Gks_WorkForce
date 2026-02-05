---
description: how to deploy the application to Vercel
---

Follow these steps to deploy your GKS Workforce application to Vercel.

### 1. Preparation
Ensure your project is pushed to a GitHub repository.

### 2. Connect to Vercel
You can deploy using the Vercel Dashboard or the CLI.

**Using the Dashboard (Recommended):**
1. Go to [vercel.com](https://vercel.com) and click **"Add New"** -> **"Project"**.
2. Import your GitHub repository.
3. In the **"Environment Variables"** section, add the following variables from your `.env.local`:
   - `NEXT_PUBLIC_FIREBASE_API_KEY`
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
   - `NEXT_PUBLIC_FIREBASE_APP_ID`
4. Click **"Deploy"**.

**Using the CLI:**
// turbo
1. Run `vercel login` if you haven't already.
// turbo
2. Run `vercel link` to link the project.
3. Run `vercel env add <variable-name>` for each variable.
// turbo
4. Run `vercel --prod` to deploy.

### 3. Post-Deployment
Once deployed, Vercel will provide you with a production URL (e.g., `gks-workforce.vercel.app`).

> [!IMPORTANT]
> 1. Add your Vercel URL to the **Authorized Domains** in the Firebase Console (Authentication -> Settings -> Authorized domains).
> 2. Ensure your Firestore rules are deployed.
