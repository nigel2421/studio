# Eracov Properties - Property Management System

This is a comprehensive property management application built with Next.js, Firebase, and Genkit. It provides a centralized platform for property managers, landlords, and tenants to manage properties, track financials, handle maintenance, and communicate effectively.

## ✨ Features

*   **Multi-Role Dashboards**: Tailored views for Admins, Agents, Landlords, and Tenants.
*   **Property & Unit Management**: Add, edit, and track properties and individual units, including bulk CSV uploads.
*   **Tenant Onboarding & Management**: Seamlessly add new tenants, manage leases, and handle tenant data.
*   **Financial Tracking**: Monitor rent collection, service charges, and arrears with detailed financial reports and automated reminders.
*   **Maintenance Requests**: Tenants can submit maintenance requests, and managers can use AI to draft professional responses.
*   **Automated Communications**: A robust system for sending announcements, payment reminders, and overdue notices.
*   **User & Access Control**: Admin-only section to manage user roles and permissions.
*   **Activity Logging**: A complete audit trail of all significant actions within the system.

## 🛠️ Tech Stack

*   **Framework**: [Next.js](https://nextjs.org/) (with App Router)
*   **UI**: [React](https://react.dev/), [ShadCN/UI](https://ui.shadcn.com/), [Tailwind CSS](https://tailwindcss.com/)
*   **Database**: [Cloud Firestore](https://firebase.google.com/docs/firestore)
*   **Backend & Authentication**: [Firebase](https://firebase.google.com/) (Cloud Functions, Firebase Auth)
*   **AI Integration**: [Genkit](https://firebase.google.com/docs/genkit) (for features like automated response drafting)
*   **Deployment**: [Firebase App Hosting](https://firebase.google.com/docs/hosting)

## 📂 Project Structure

Here's a high-level overview of the key directories:

```
.
├── src/
│   ├── app/                # Next.js App Router: pages, layouts, and API routes
│   │   ├── (app)/          # Main application routes for authenticated managers/agents
│   │   ├── (landlord)/     # Routes for the landlord portal
│   │   ├── (tenant)/       # Routes for the tenant portal
│   │   └── login/          # The main login page
│   ├── components/         # Reusable React components (UI, layout, etc.)
│   ├── lib/                # Core application logic, data fetching, and Firebase integration
│   ├── hooks/              # Custom React hooks (e.g., useAuth, useLoading)
│   ├── ai/                 # Genkit flows for AI-powered features
│   └── functions/          # Firebase Cloud Functions source code
├── firebase.json           # Firebase project configuration
└── firestore.rules         # Firestore security rules
```

## 🚀 Getting Started

### Prerequisites

*   Node.js (v18 or later)
*   Firebase CLI (`npm install -g firebase-tools`)

### Setup

1.  **Clone the repository**:
    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install dependencies**:
    ```bash
    npm install
    ```

3.  **Firebase Configuration**:
    *   Ensure you have a Firebase project set up. The configuration details are in `src/lib/firebase.ts`.
    *   Set up your local Firebase environment by logging in:
        ```bash
        firebase login
        ```
    *   Configure the Firebase CLI to use your project:
        ```bash
        firebase use <your-firebase-project-id>
        ```

4.  **Environment Variables**:
    *   The project uses Firebase Cloud Functions for sending emails. You'll need to set up the required secrets for your SMTP provider in your Firebase project: `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`.
    *   You can set these locally using a `.env` file in the `functions` directory.

### Running the Development Server

The app is configured to work with the Firebase Local Emulator Suite.

1.  **Start the Emulators and Dev Server**:
    The simplest way to run everything is to use the `dev` script.
    ```bash
    npm run dev
    ```
    This command will start the Next.js development server and the Firebase emulators for Auth, Firestore, and Functions.

2.  **Access the app**:
    Open [http://localhost:3000](http://localhost:3000) in your browser to see the application. The Emulator UI will be available at [http://localhost:4000](http://localhost:4000).

## ✅ Testing

This project uses Jest for unit testing.

*   **Run all tests**:
    ```bash
    npm test
    ```
*   **Type Checking**: To ensure type safety across the project, run:
    ```bash
    npm run typecheck
    ```
