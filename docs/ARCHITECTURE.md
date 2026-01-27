# Application Architecture

This document provides a high-level overview of the architecture for the Eracov Properties management system.

## Core Principles

*   **Server-Centric**: Leverages Next.js App Router with Server Components by default to minimize client-side JavaScript and improve performance.
*   **Component-Based UI**: Built with React and a set of reusable, aesthetically pleasing components from ShadCN/UI.
*   **Scalable Backend**: Uses Firebase's suite of services (Firestore, Authentication, Cloud Functions) for a robust and scalable backend infrastructure.
*   **Role-Based Access Control (RBAC)**: A clear separation of concerns and features based on user roles (Admin, Agent, Landlord, Tenant).

## Technology Stack

*   **Frontend**: Next.js 14+ (App Router), React, TypeScript, Tailwind CSS, ShadCN/UI.
*   **Backend**: Firebase Cloud Functions (written in TypeScript).
*   **Database**: Cloud Firestore, a NoSQL document database.
*   **Authentication**: Firebase Authentication for email/password logins.
*   **AI**: Genkit for integrating generative AI features.
*   **Deployment**: Firebase App Hosting.

## System Components

### 1. Frontend (Next.js Application)

*   **Directory**: `src/app`
*   **Description**: The main user-facing application. It's structured using the Next.js App Router.
*   **Routing Groups**:
    *   `(app)`: Contains all routes for the main administrative dashboard (Admins, Agents).
    *   `(landlord)`: The dedicated portal for property owners to view their financial summaries.
    *   `(tenant)`: The self-service portal for tenants to view payments and submit maintenance requests.
    *   `login`: The public-facing login page.
*   **State Management**: Primarily uses React's built-in state management (e.g., `useState`, `useEffect`, `useContext`) for local and shared state. The `useAuth` hook provides global access to user and profile information.
*   **Data Fetching**: Data is fetched from Firestore using a data access layer defined in `src/lib/data.ts`. This layer abstracts the direct Firestore queries. Real-time updates are handled via Firestore's `onSnapshot` listeners.

### 2. Backend (Firebase Cloud Functions)

*   **Directory**: `src/functions`
*   **Description**: Handles server-side logic that cannot be done on the client, such as sending emails or performing scheduled tasks.
*   **Key Functions**:
    *   `sendCustomEmail`: A callable function to send bulk announcements.
    *   `sendPaymentReceipt`: A callable function triggered after a payment is made to email a receipt to the tenant.
    *   `checkAndSendLeaseReminders`: A callable function that automates sending payment reminders and overdue notices, and applies late fees.

### 3. Database (Cloud Firestore)

*   **Security Rules**: Defined in `firestore.rules`. These rules are critical for securing data and enforcing access control based on user roles and data ownership. For example, a tenant can only read their own data, while an admin can read all data.
*   **Data Model**: The primary data entities are defined as TypeScript interfaces in `src/lib/types.ts`. Key collections include:
    *   `properties`: Stores information about each building, including its list of `units`.
    *   `tenants`: Contains tenant information, including their `lease` details and financial balances (`dueBalance`, `accountBalance`).
    *   `users`: Stores user profiles, linking a Firebase Auth UID to a `role` and other app-specific information.
    *   `payments`: A log of all financial transactions (rent, deposits, adjustments).
    *   `maintenanceRequests`: A collection of all issues reported by tenants.
    *   `logs`: An audit trail of important system actions.
    *   `communications`: A record of all sent emails and notifications.

### 4. Authentication (Firebase Auth)

*   **Integration**: Managed via the `useAuth` hook (`src/hooks/useAuth.tsx`), which wraps Firebase's `onAuthStateChanged` listener.
*   **Workflow**:
    1.  User signs in via the `/login` page.
    2.  Firebase Auth verifies credentials and creates a session.
    3.  The `useAuth` hook detects the authenticated user.
    4.  It then fetches the corresponding user profile from the `users` collection in Firestore to determine their role and other details.
    5.  The `AuthWrapper` component performs role-based redirects, ensuring users can only access the parts of the application they are authorized to see.
