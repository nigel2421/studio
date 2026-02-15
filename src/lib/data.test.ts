
// Import all exports from data.ts to allow spying
import {
    getUsers,
    deleteLandlord,
    deletePropertyOwner,
    addWaterMeterReading,
    getProperties,
    getLandlords,
    getPropertyOwners,
    getTenant,
    getPaymentHistory,
    getTenantWaterReadings
} from './data';
import { cacheService } from './cache'; // Import the cache service

// Import types for mock data
import { Landlord, Property, PropertyOwner, UserProfile, Unit, Payment, Tenant } from './types';
import { runTransaction } from 'firebase/firestore';

// Mock the entire 'firebase/firestore' module since it's a low-level dependency used by many functions
jest.mock('firebase/firestore', () => ({
    ...jest.requireActual('firebase/firestore'),
    getFirestore: jest.fn(() => ({})), // Return a dummy object to prevent real DB initialization
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    doc: jest.fn((db, collection, id) => ({
        path: `${collection}/${id}`,
    })),
    writeBatch: jest.fn(),
    deleteDoc: jest.fn(),
    updateDoc: jest.fn(),
    addDoc: jest.fn(),
    runTransaction: jest.fn(),
    collection: jest.fn((db, path) => ({
        _path: { segments: [path] },
    })),
    // Pass through query and where so we can inspect them in mocks
    query: jest.fn((coll, ...constraints) => ({ ...coll, _constraints: constraints })),
    where: jest.fn((field, op, value) => ({ field, op, value })),
    deleteField: jest.fn(() => 'DELETE_FIELD_SENTINEL'), // Return a sentinel value for inspection
}));

// Import the mocked functions so we can manipulate them
import { getDoc, writeBatch, getDocs, updateDoc, addDoc } from 'firebase/firestore';

const mockGetDocs = getDocs as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const mockRunTransaction = runTransaction as jest.Mock;

// --- Test Suite ---
describe('Data Logic in `data.ts`', () => {

    beforeEach(() => {
        // Clear all mocks and the data cache before each test
        jest.clearAllMocks();
        cacheService.clear();
    });

    describe('Data Deletion Functions', () => {
        // Helper to mock the Firestore batch write operation
        const createMockBatch = () => {
            const operations: any[] = [];
            const batch = {
                delete: jest.fn((ref) => operations.push({ type: 'delete', ref })),
                update: jest.fn((ref, data) => operations.push({ type: 'update', ref, data })),
                commit: jest.fn(() => Promise.resolve()),
                _getOperations: () => operations,
            };
            (writeBatch as jest.Mock).mockReturnValue(batch);
            return batch;
        };

        it('should delete a landlord and unassign their units', async () => {
            // Arrange
            const landlordId = 'landlord-1';
            const mockLandlord: Landlord = { id: landlordId, name: 'Test Landlord', email: 'test@l.com', phone: '123' };
            const mockProperties: Property[] = [
                { id: 'prop-1', name: 'Prop 1', address: '', type: '', imageId: '', units: [{ name: 'A1', landlordId: landlordId, status: 'rented', ownership: 'Landlord', unitType: 'Studio' }] },
                { id: 'prop-2', name: 'Prop 2', address: '', type: '', imageId: '', units: [{ name: 'B2', landlordId: landlordId, status: 'rented', ownership: 'Landlord', unitType: 'Studio' }] },
            ];

            mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockLandlord });
            mockGetDocs.mockImplementation(async (q: any) => {
                if (q._path.segments[0] === 'properties') {
                    return { docs: mockProperties.map(p => ({ id: p.id, data: () => p })) };
                }
                return { docs: [] };
            });

            const batch = createMockBatch();

            // Act
            await deleteLandlord(landlordId);

            // Assert
            expect(batch.commit).toHaveBeenCalled();
            expect(batch.delete).toHaveBeenCalledTimes(1);
            expect(batch.update).toHaveBeenCalledTimes(2);
        });

        it('should throw an error if trying to delete the internal Soil Merchants profile', async () => {
            await expect(deleteLandlord('soil_merchants_internal')).rejects.toThrow(
                "Cannot delete the internal Soil Merchants profile."
            );
        });

        it('should delete a property owner and their user link', async () => {
            // Arrange
            const ownerId = 'owner-1';
            const mockOwner: PropertyOwner = {
                id: ownerId, name: 'Test Owner', email: 'test@o.com', phone: '123', userId: 'user-123',
                assignedUnits: [{ propertyId: 'prop-1', unitNames: ['U1'] }]
            };

            mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockOwner });
            const batch = createMockBatch();

            // Act
            await deletePropertyOwner(ownerId);

            // Assert
            expect(batch.commit).toHaveBeenCalled();
            expect(batch.delete).toHaveBeenCalledTimes(1);
            const userUpdateOp = batch._getOperations().find((op: any) => op.type === 'update');
            expect(userUpdateOp).toBeDefined();
            expect(userUpdateOp.data).toEqual({
                propertyOwnerId: 'DELETE_FIELD_SENTINEL',
                role: 'viewer'
            });
        });
    });

    describe('Water Meter Logic', () => {
        it('should add a water reading and only reconcile rent balance', async () => {
            // Arrange
            const mockTenant: Tenant = { id: 'tenant-1', name: 'Water Tenant', dueBalance: 1000, accountBalance: 0, lease: { rent: 20000, paymentStatus: 'Pending' as const, lastBilledPeriod: '2024-01', startDate: '2024-01-01', endDate: '2025-01-01' } } as Tenant;
            const mockProperty: Property = { id: 'prop-1', name: 'Prop 1', units: [{ name: 'Unit 1', serviceCharge: 0 } as Unit] } as Property;
            const readingData = {
                propertyId: 'prop-1',
                unitName: 'Unit 1',
                priorReading: 100,
                currentReading: 120,
                date: '2024-02-15',
            };
            const expectedConsumption = 20;
            const WATER_RATE = 150;
            const expectedWaterAmount = expectedConsumption * WATER_RATE;

            // Mock Firestore getDocs to return tenant and getDoc to return property
            mockGetDocs.mockImplementation(async (q: any) => {
                const path = q._path.segments[0];
                if (path === 'tenants') {
                    return {
                        empty: false,
                        docs: [{ id: 'tenant-1', ref: { path: 'tenants/tenant-1' }, data: () => mockTenant }],
                    };
                }
                return { docs: [], empty: true };
            });

            mockGetDoc.mockImplementation(async (ref: any) => {
                if (ref.path.startsWith('properties/')) {
                    return { exists: () => true, id: 'prop-1', data: () => mockProperty };
                }
                 if (ref.path.startsWith('propertyOwners/')) {
                    return { exists: () => false };
                }
                 if (ref.path.startsWith('landlords/')) {
                    return { exists: () => false };
                }
                return { exists: () => false };
            });

            const mockUpdateDoc = updateDoc as jest.Mock;
            const mockAddDoc = addDoc as jest.Mock;
            mockUpdateDoc.mockResolvedValue(undefined);
            mockAddDoc.mockResolvedValue(undefined);

            // Act
            await addWaterMeterReading(readingData, new Date('2024-02-20'));

            // Assert
            // 1. Check that a water reading was added with correct details
            const addWaterReadingCall = mockAddDoc.mock.calls.find(call => call[0]._path.segments[0] === 'waterReadings');
            expect(addWaterReadingCall).toBeDefined();
            expect(addWaterReadingCall[1]).toMatchObject({
                propertyId: 'prop-1',
                unitName: 'Unit 1',
                consumption: expectedConsumption,
                amount: expectedWaterAmount,
                status: 'Pending'
            });

            // 2. Check that the tenant's balance was updated ONLY with rent reconciliation
            const tenantUpdateCall = mockUpdateDoc.mock.calls[0];
            expect(tenantUpdateCall).toBeDefined();
            const updatedData = tenantUpdateCall[1];
            expect(tenantUpdateCall[0].path).toBe('tenants/tenant-1');
            
            // Expected balance = initial due (1000) + Feb rent (20000) = 21000. Water bill should NOT be added here.
            expect(updatedData.dueBalance).toBe(21000); 
            expect(updatedData['lease.paymentStatus']).toBe('Overdue');
            expect(updatedData['lease.lastBilledPeriod']).toBe('2024-02');
        });
    });
});
