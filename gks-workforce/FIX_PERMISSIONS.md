# 🚨 Critical Setup Step Required

The "Missing or insufficient permissions" error happens because your Firestore Database is currently **LOCKED** (which is the default security setting).

You must deploy the security rules included in this project to unlock it.

## Step 1: Install Firebase Tools
Run this in your terminal:
```bash
npm install -g firebase-tools
```

## Step 2: Login to Firebase
Run this and follow the browser prompt to log in:
```bash
firebase login
```

## Step 3: Initialize & Deploy
Run these commands inside the `gks-workforce` directory:

1.  **Initialize Project** (Connect to your Firebase project):
    ```bash
    firebase init firestore
    ```
    - Select **"Use an existing project"**
    - Choose `gks-workforce` from the list
    - Press Enter to accept the default filenames (`firestore.rules`, `firestore.indexes.json`) — **Do not overwrite if asked**, or if you do, ensure the content from the repository is preserved. (Actually, if you overwrite, you lose my rules! So say **NO** to overwrite `firestore.rules`, or re-paste the content).

2.  **Deploy Rules**:
    ```bash
    firebase deploy --only firestore
    ```

## Step 4: Create Admin User (If you haven't)
You will not be able to log in until you manually create the admin user in the Firebase Console.

1.  Go to [Firebase Console](https://console.firebase.google.com/) -> Build -> Authentication -> Users.
2.  Click **Add User**. Enter email `admin@gks.com` and a password.
3.  Copy the **User UID** of the new user.
4.  Go to Build -> Firestore Database -> Data.
5.  Click **Start collection**. ID: `users`.
6.  **Document ID**: PASTE THE UID HERE (Do not use auto-id).
7.  **Fields**:
    - `name` (string): "Admin"
    - `email` (string): "admin@gks.com"
    - `role` (string): "ADMIN"h
    - `isActive` (boolean): `true`
    - `hourlyRate` (number): `50`

## Step 5: Restart Server
Stop the running server (Ctrl+C) and run:
```bash
npm run dev
```
