# Testing Strategy

This document outlines the testing strategy for the Eracov Properties application, including unit tests for key business logic.

## Frameworks

*   **Jest**: Used as the primary testing framework for running tests.
*   **React Testing Library**: Will be used for component-level testing (not yet implemented).
*   **Firebase Test SDK**: Used for mocking Firestore interactions.

## Unit Tests

### Arrears Logic (`arrears.test.ts`)

Tests the logic for identifying and summarizing outstanding balances.
*   `getTenantsInArrears`: Confirms that only tenants with a `dueBalance > 0` are correctly identified and sorted.
*   `getLandlordArrearsBreakdown`: Validates the correct calculation of deductions for a landlord, separating arrears from their occupied units versus service charges for their vacant (but handed-over) units.

### Service Charge Logic (`service-charge.test.ts`)

This suite covers the complex logic for tracking service charge payments for different types of client-owned units.
*   It verifies that both "Client Occupied" and "Managed Vacant" units are correctly identified.
*   It tests the payment status ('Paid', 'Pending', 'N/A') based on payments made for the selected month.
*   It confirms that historical arrears for vacant units are calculated correctly based on the unit's handover date.

### Data Logic (`data.test.ts`)

This test suite covers critical data manipulation functions.

**Deletion Logic:**
*   `deleteLandlord`: Ensures deleting a landlord correctly unassigns their units and does not affect other landlords' units. Also tests that the internal "Soil Merchants" profile cannot be deleted.
*   `deletePropertyOwner`: Verifies that deleting a client owner correctly removes their profile and demotes their associated user account to a basic "viewer" role.

**User Role Logic:**
*   `getUsers`: This tests the dynamic role assignment logic. It verifies that a user is correctly identified as a `landlord` if they own any units managed by Eracov, and as a `homeowner` if they only own self-managed ("Client Managed") units. It also ensures the `landlord` role takes precedence and that non-owner roles are not affected.
