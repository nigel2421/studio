# Dashboard Logic Explained

This document breaks down the logic and data flow for the main dashboard page located at `src/app/(app)/dashboard/page.tsx`.

## Core Principle: Dynamic Server-Side Rendering

The dashboard is built as a **Next.js Server Component**. This means the page is rendered on the server for every request, providing several key benefits:

1.  **Performance**: The initial page load is fast because the client receives a fully-formed HTML document.
2.  **Up-to-Date Data**: Every visit fetches the latest information from the database, ensuring the dashboard is always current.
3.  **Security**: All data fetching and database credentials remain on the server, never exposed to the client's browser.

## Data Flow

The process of displaying data for a selected property follows these steps:

1.  **URL Parameters (`searchParams`)**: The page is designed to be dynamic based on the URL. It looks for a `propertyId` in the URL query string (e.g., `/dashboard?propertyId=some-id`). This `propertyId` dictates which property's data to display.

2.  **Default Property**: If no `propertyId` is found in the URL (which happens on the first visit to `/dashboard`), the system fetches the full list of properties and automatically defaults to using the ID of the *first property* in that list. This ensures the dashboard always displays meaningful data on the initial load.

3.  **Data Fetching (`getDashboardData`)**: Once a `selectedPropertyId` is determined, a helper function `getDashboardData` is called. This function is optimized for performance and executes several database queries in parallel:
    *   It fetches the full details for the single selected property (`getProperty`).
    *   It fetches all tenants associated *only* with that property (`getTenants({ propertyId: ... })`).
    *   It fetches all maintenance requests associated *only* with that property (`getMaintenanceRequests({ propertyId: ... })`).

4.  **Dependent Data Fetching**: After the initial data is retrieved, a second, dependent fetch occurs:
    *   Using the list of tenant IDs from the previous step, it fetches all payment records *only* for those specific tenants (`getPaymentsForTenants`).

5.  **Component Rendering**: The complete data object (property, tenants, maintenance requests, and payments) is then passed down as props to the various chart and analytics components for rendering.

## Component Structure

The dashboard is composed of several smaller, specialized components:

*   **`DashboardPage` (`page.tsx`)**: The main `async` Server Component that orchestrates the entire data flow.
*   **`PropertySelector`**: A Client Component that allows the user to switch between properties. When a new property is selected, it updates the URL's `propertyId`, causing Next.js to re-render the page on the server with the new data.
*   **`DashboardStats`**: A Client Component that displays the high-level summary cards (Total Tenants, Occupancy, etc.).
*   **Chart Components (`FinancialOverviewChart`, `OccupancyOverviewChart`, etc.)**: A series of Client Components, each responsible for rendering a specific `recharts` graph based on the data passed down from the main page component.
*   **`UnitAnalytics`, `StatusAnalytics`, `OrientationAnalytics`**: These are more detailed components that provide tabular breakdowns of unit statuses within the selected property.

This architecture ensures a clear separation of concerns, where the server handles the heavy lifting of data fetching and the client handles user interaction and rich data visualization.
