# GKS Workforce Management System

A mobile-friendly web application for managing staff availability, shift rostering, and worked hours for GKS shop.

## 🎯 Features

### Staff Features
- ✅ Login with admin-created credentials
- ✅ Set weekly availability with multiple time ranges per day
- ✅ Copy availability from previous week
- ✅ Set recurring availability for future weeks
- ✅ View approved roster (read-only)
- ✅ View weekly hours worked and gross pay
- ✅ Clock in/out via web interface

### Admin Features
- ✅ Create and manage staff accounts
- ✅ Set and update staff hourly pay rates
- ✅ Activate/deactivate staff accounts
- ✅ View all staff availability submissions
- ✅ Approve and assign shifts with validation
- ✅ Real-time two-section roster management page
- ✅ View weekly hours and pay summaries for all staff

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Firebase account
- Git

### 1. Clone the Repository
```bash
cd /Users/bipinsapkota/Documents/GKS-WORKFORCE/Gks_WorkForce/gks-workforce
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Firebase Setup

#### Create a Firebase Project
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click "Add project"
3. Follow the setup wizard
4. Enable **Authentication** → Email/Password provider
5. Create a **Firestore Database** in production mode

#### Get Firebase Configuration
1. In Firebase Console, go to Project Settings
2. Scroll to "Your apps" section
3. Click the web icon (</>) to create a web app
4. Copy the configuration values

#### Configure Environment Variables
1. Copy the example file:
```bash
cp .env.local.example .env.local
```

2. Edit `.env.local` and add your Firebase credentials:
```env
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key_here
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project_id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project_id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
```

### 4. Deploy Firestore Security Rules and Indexes

#### Install Firebase CLI
```bash
npm install -g firebase-tools
```

#### Login to Firebase
```bash
firebase login
```

#### Initialize Firebase in Project
```bash
firebase init
```
- Select **Firestore** only
- Use existing project
- Accept default file names (`firestore.rules` and `firestore.indexes.json`)

#### Deploy Rules and Indexes
```bash
firebase deploy --only firestore:rules,firestore:indexes
```

### 5. Create First Admin User

Since staff accounts can only be created by admins, you need to create the first admin manually:

1. Go to Firebase Console → Authentication
2. Click "Add user"
3. Enter email and password
4. Click "Add user"
5. Copy the User UID
6. Go to Firestore Database
7. Create a new collection called `users`
8. Add a document with the User UID as the document ID:
```json
{
  "name": "Admin Name",
  "email": "admin@example.com",
  "role": "ADMIN",
  "hourlyRate": 0,
  "isActive": true,
  "createdAt": [current timestamp],
  "updatedAt": [current timestamp]
}
```

### 6. Run the Development Server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📱 Usage Guide

### For Admins

#### Creating Staff Accounts
1. Login with admin credentials
2. Navigate to **Staff Management**
3. Click **+ Create New Staff**
4. Fill in staff details (name, email, password, hourly rate)
5. Click **Create Staff Account**

#### Managing Availability & Roster
1. Navigate to **Availability & Roster**
2. Select the week and day
3. **Left Section (Roster View)**: See approved shifts (read-only)
4. **Right Section (Availability)**: See staff availability submissions
5. Click **Approve Shift** on any staff member
6. Set shift start and end times (must be within availability)
7. Click **Approve Shift** to confirm
8. The roster updates automatically in real-time

#### Viewing Hours Summary
1. Navigate to **Hours Summary**
2. Select the week
3. View total hours and gross pay for all staff

### For Staff

#### Setting Availability
1. Login with your credentials
2. Navigate to **My Availability**
3. Select the week
4. For each day, click **+ Add Time Range**
5. Set start and end times
6. Optional: Click **Copy from Last Week**
7. Optional: Check **Set as recurring**
8. Click **Submit Availability**

#### Viewing Roster
1. Navigate to **My Roster**
2. Select the week
3. View your approved shifts (read-only)

#### Viewing Hours & Pay
1. Navigate to **Hours & Pay**
2. Select the week
3. View total hours worked and gross pay

#### Clock In/Out
1. Navigate to **Time Clock** (or scan QR code in shop)
2. Click **Clock In** when starting work
3. Click **Clock Out** when finishing work
4. Hours are automatically calculated

## 🏗️ Project Structure

```
gks-workforce/
├── app/
│   ├── admin/
│   │   ├── hours/          # Admin hours summary
│   │   ├── roster/         # Two-section roster page
│   │   └── staff/          # Staff management
│   ├── staff/
│   │   ├── availability/   # Staff availability form
│   │   ├── hours/          # Staff hours & pay
│   │   └── roster/         # Staff roster view
│   ├── clock/              # Clock in/out page
│   ├── dashboard/          # Main dashboard
│   ├── login/              # Login page
│   └── layout.tsx          # Root layout with AuthProvider
├── components/
│   └── ProtectedRoute.tsx  # Role-based route protection
├── contexts/
│   └── AuthContext.tsx     # Authentication state
├── lib/
│   ├── firebase.ts         # Firebase configuration
│   └── utils.ts            # Utility functions
├── types/
│   └── index.ts            # TypeScript types
├── firestore.rules         # Firestore security rules
└── firestore.indexes.json  # Firestore indexes
```

## 🔒 Security

- **Authentication**: Firebase Authentication with email/password
- **Authorization**: Role-based access control (STAFF vs ADMIN)
- **Firestore Rules**: Strict security rules enforcing role permissions
- **Protected Routes**: Client-side route protection based on user role

## 🎨 Design

- **Mobile-first**: Optimized for mobile devices
- **Responsive**: Works on desktop, tablet, and mobile
- **Two-section layout**: Desktop/tablet shows side-by-side sections
- **Real-time updates**: Firestore listeners for instant synchronization

## 📊 Data Model

### Collections

#### `users`
- User accounts (staff and admin)
- Fields: name, email, role, hourlyRate, isActive

#### `availability`
- Staff availability submissions
- Fields: staffId, weekStartDate, dayOfWeek, timeRanges, isRecurring, status

#### `shifts`
- Approved roster assignments
- Fields: staffId, date, startTime, endTime, status, approvedBy

#### `timeRecords`
- Clock in/out records
- Fields: staffId, clockInTime, clockOutTime, hoursWorked

## 🚨 Important Notes

- Staff accounts can ONLY be created by admins
- Shifts MUST be within staff availability
- Shifts CANNOT overlap for the same staff
- All timestamps use server time (not client time)
- Availability must be submitted before admin can approve shifts

## 🛠️ Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Authentication**: Firebase Authentication
- **Database**: Cloud Firestore
- **Hosting**: Firebase Hosting (recommended)

## 📝 License

Private project for GKS shop.

## 🆘 Support

For issues or questions, contact the development team.
