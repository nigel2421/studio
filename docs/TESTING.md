# Testing Strategy

This document outlines the testing strategy for the Eracov Properties application, including unit tests for key business logic.

## Frameworks

*   **Jest**: Used as the primary testing framework for running tests.
*   **React Testing Library**: Will be used for component-level testing (not yet implemented).
*   **Firebase Test SDK**: Used for mocking Firestore interactions.

## Unit Tests

### Financial Logic (`financial-logic.test.ts`)

This suite tests the core financial calculations:
*   `calculateTransactionBreakdown`: Verifies correct calculation of management fees (standard 5% and first-month 50% commission), service charge deductions, and net payouts.
*   `aggregateFinancials`: Ensures that a landlord's summary is correctly aggregated from multiple payments across different unit types and ownership models.

### Arrears Logic (`arrears.test.ts`)

Tests the logic for identifying and summarizing outstanding balances.
*   `getTenantsInArrears`: Confirms that only tenants with a `dueBalance > 0` are correctly identified and sorted.
*   `getLandlordArrearsBreakdown`: Validates the correct calculation of deductions for a landlord, separating arrears from their occupied units versus service charges for their vacant (but handed-over) units.

### Service Charge Logic (`service-charge.test.ts`)

This suite covers the complex logic for tracking service charge payments for different types of client-owned units.
*   It verifies that both "Client Occupied" and "Managed Vacant" units are correctly identified.
*   It tests the payment status ('Paid', 'Pending', 'N/A') based on payments made for the selected month.
*   It confirms that historical arrears for vacant units are calculated correctly based on the unit's handover date.

### Deletion Logic

The following tests ensure that deleting landlords and property owners works as expected, cleaning up related data without causing integrity issues.

```typescript
import { deleteLandlord, deletePropertyOwner } from './data';
import { db } from './firebase';
import { getDoc, deleteDoc, writeBatch, updateDoc, collection, query, where, getDocs, doc, deleteField } from 'firebase/firestore';
import { Landlord, PropertyOwner, Property } from './types';

// Mock Firestore functions
jest.mock('./firebase', () => ({
    db: jest.fn(),
    auth: jest.fn(),
}));

jest.mock('firebase/firestore', () => ({
    ...jest.requireActual('firebase/firestore'),
    getDoc: jest.fn(),
    deleteDoc: jest.fn(),
    writeBatch: jest.fn(),
    updateDoc: jest.fn(),
    collection: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    getDocs: jest.fn(),
    doc: jest.fn(),
    deleteField: jest.fn(() => 'DELETE_FIELD_SENTINEL'),
}));

// Mock data helpers
const mockGetDoc = getDoc as jest.Mock;
const mockGetDocs = getDocs as jest.Mock;
const mockUpdateDoc = updateDoc as jest.Mock;
const mockDeleteDoc = deleteDoc as jest.Mock;
const mockWriteBatch = writeBatch as jest.Mock;

const createMockBatch = () => {
    const operations: any[] = [];
    return {
        delete: jest.fn((ref) => operations.push({ type: 'delete', ref })),
        update: jest.fn((ref, data) => operations.push({ type: 'update', ref, data })),
        set: jest.fn((ref, data) => operations.push({ type: 'set', ref, data })),
        commit: jest.fn(() => Promise.resolve()),
        _operations: operations, // For inspection in tests
    };
};

describe('Data Deletion Functions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('deleteLandlord', () => {
        it('should delete a landlord and unassign their units', async () => {
            const landlordId = 'landlord-1';
            const mockLandlord: Landlord = { id: landlordId, name: 'Test Landlord', email: 'test@l.com', phone: '123' };
            const mockProperties: Property[] = [
                { id: 'prop-1', name: 'Prop 1', address: '', type: '', imageId: '', units: [{ name: 'A1', landlordId: landlordId, status: 'rented', ownership: 'Landlord', unitType: 'Studio' }] },
                { id: 'prop-2', name: 'Prop 2', address: '', type: '', imageId: '', units: [{ name: 'B1', landlordId: 'other-id', status: 'rented', ownership: 'Landlord', unitType: 'Studio' }, { name: 'B2', landlordId: landlordId, status: 'rented', ownership: 'Landlord', unitType: 'Studio' }] },
            ];

            mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockLandlord });
            mockGetDocs.mockResolvedValue({ docs: mockProperties.map(p => ({ data: () => p, id: p.id })) }); // Simulate getProperties
            const batch = createMockBatch();
            mockWriteBatch.mockReturnValue(batch);

            await deleteLandlord(landlordId);

            // Expect batch commit to be called
            expect(batch.commit).toHaveBeenCalled();

            // Check operations
            expect(batch.delete).toHaveBeenCalledTimes(1); // Deletes the landlord doc

            // Check updates
            expect(batch.update).toHaveBeenCalledTimes(2); // Updates both properties
            
            const prop1Update = batch._operations.find(op => op.ref && op.ref.path.includes('prop-1'));
            expect(prop1Update.data.units[0]).not.toHaveProperty('landlordId');
            
            const prop2Update = batch._operations.find(op => op.ref && op.ref.path.includes('prop-2'));
            expect(prop2Update.data.units[0].landlordId).toBe('other-id'); // Unchanged
            expect(prop2Update.data.units[1]).not.toHaveProperty('landlordId'); // Changed
        });

        it('should throw an error if trying to delete the internal Soil Merchants profile', async () => {
            await expect(deleteLandlord('soil_merchants_internal')).rejects.toThrow(
                "Cannot delete the internal Soil Merchants profile."
            );
        });
    });

    describe('deletePropertyOwner', () => {
        it('should delete a property owner and their user link', async () => {
            const ownerId = 'owner-1';
            const mockOwner: PropertyOwner = {
                id: ownerId,
                name: 'Test Owner',
                email: 'test@o.com',
                phone: '123',
                userId: 'user-123',
                assignedUnits: [{ propertyId: 'prop-1', unitNames: ['U1'] }]
            };

            mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockOwner });
            const batch = createMockBatch();
            mockWriteBatch.mockReturnValue(batch);

            await deletePropertyOwner(ownerId);

            expect(batch.commit).toHaveBeenCalled();
            expect(batch.delete).toHaveBeenCalledTimes(1); // Deletes the owner doc

            // Check user update
            const userUpdate = batch._operations.find(op => op.ref && op.ref.path.includes('user-123'));
            expect(userUpdate).toBeDefined();
            expect(userUpdate.type).toBe('update');
            expect(userUpdate.data).toEqual({
                propertyOwnerId: 'DELETE_FIELD_SENTINEL',
                role: 'viewer'
            });
        });
    });
});
```
