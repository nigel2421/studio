// Import all exports from data.ts to allow spying
import * as data from './data';
import { cacheService } from './cache'; // Import the cache service

// Import types for mock data
import { Landlord, Property, PropertyOwner, UserProfile, Unit, Payment } from './types';
import { addDoc, runTransaction } from 'firebase/firestore';

// Mock the entire 'firebase/firestore' module since it's a low-level dependency used by many functions
jest.mock('firebase/firestore', () => ({
    ...jest.requireActual('firebase/firestore'),
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
    deleteField: jest.fn(() => 'DELETE_FIELD_SENTINEL'), // Return a sentinel value for inspection
}));

// Import the mocked functions so we can manipulate them
import { getDoc, writeBatch, getDocs } from 'firebase/firestore';

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

    // Test suite for the dynamic role assignment in getUsers
    describe('getUsers Role Differentiation', () => {
        it('should correctly identify a user as a "landlord"', async () => {
            // Arrange
            const mockUser: UserProfile = { id: 'user-1', email: 'investor@test.com', role: 'viewer', landlordId: 'landlord-1' };
            const mockLandlord: Landlord = { id: 'landlord-1', name: 'Investor Landlord', email: 'investor@test.com', phone: '111' };
            const mockInvestorUnit: Unit = { name: 'A1', ownership: 'Landlord', status: 'rented', landlordId: 'landlord-1', managementStatus: 'Rented for Clients', unitType: 'Studio' };
            const mockProperty: Property = { id: 'prop-1', name: 'Prop 1', address: 'addr', type: 'res', imageId: '1', units: [mockInvestorUnit] };
            
            mockGetDocs.mockImplementation(async (q: any) => {
                const path = q._query.path.segments[0];
                if (path === 'users') return { docs: [{ id: 'user-1', data: () => mockUser }] };
                if (path === 'properties') return { docs: [{ id: 'prop-1', data: () => mockProperty }] };
                if (path === 'landlords') return { docs: [{ id: 'landlord-1', data: () => mockLandlord }] };
                if (path === 'propertyOwners') return { docs: [] };
                return { docs: [] };
            });

            // Act
            const users = await data.getUsers();
            
            // Assert
            expect(users).toHaveLength(1);
            expect(users[0].role).toBe('landlord');
        });
    
        it('should correctly identify a user as a "homeowner"', async () => {
            // Arrange
            const mockUser: UserProfile = { id: 'user-2', email: 'homeowner@test.com', role: 'viewer', propertyOwnerId: 'owner-1' };
            const mockOwner: PropertyOwner = { id: 'owner-1', name: 'Home Owner', email: 'homeowner@test.com', phone: '222', assignedUnits: [{ propertyId: 'prop-1', unitNames: ['B1'] }] };
            const mockClientUnit: Unit = { name: 'B1', ownership: 'Landlord', status: 'client occupied', managementStatus: 'Client Managed', unitType: 'Studio' };
            const mockProperty: Property = { id: 'prop-1', name: 'Prop 1', address: 'addr', type: 'res', imageId: '1', units: [mockClientUnit] };
    
            mockGetDocs.mockImplementation(async (q: any) => {
                const path = q._query.path.segments[0];
                if (path === 'users') return { docs: [{ id: 'user-2', data: () => mockUser }] };
                if (path === 'properties') return { docs: [{ id: 'prop-1', data: () => mockProperty }] };
                if (path === 'landlords') return { docs: [] };
                if (path === 'propertyOwners') return { docs: [{ id: 'owner-1', data: () => mockOwner }] };
                return { docs: [] };
            });
    
            // Act
            const users = await data.getUsers();
            
            // Assert
            expect(users).toHaveLength(1);
            expect(users[0].role).toBe('homeowner');
        });
    
        it('should prioritize "landlord" role for mixed-ownership users', async () => {
             // Arrange
            const mockUser: UserProfile = { id: 'user-3', email: 'mixed@test.com', role: 'viewer', landlordId: 'owner-2' };
            const mockOwner: Landlord = { id: 'owner-2', name: 'Mixed Owner', email: 'mixed@test.com', phone: '333' };
            const mockInvestorUnit: Unit = { name: 'A1', ownership: 'Landlord', landlordId: 'owner-2', status: 'rented', managementStatus: 'Rented for Clients', unitType: 'Studio' };
            const mockClientUnit: Unit = { name: 'B1', ownership: 'Landlord', landlordId: 'owner-2', status: 'client occupied', managementStatus: 'Client Managed', unitType: 'Studio' };
            const mockProperty: Property = { id: 'prop-1', name: 'Prop 1', address: 'addr', type: 'res', imageId: '1', units: [mockInvestorUnit, mockClientUnit] };

            mockGetDocs.mockImplementation(async (q: any) => {
                const path = q._query.path.segments[0];
                if (path === 'users') return { docs: [{ id: 'user-3', data: () => mockUser }] };
                if (path === 'properties') return { docs: [{ id: 'prop-1', data: () => mockProperty }] };
                if (path === 'landlords') return { docs: [{ id: 'owner-2', data: () => mockOwner }] };
                if (path === 'propertyOwners') return { docs: [] };
                return { docs: [] };
            });

            // Act
            const users = await data.getUsers();
            
            // Assert
            expect(users).toHaveLength(1);
            expect(users[0].role).toBe('landlord');
        });

        it('should not change the role for a user not linked to any properties', async () => {
            // Arrange
            const mockUser: UserProfile = { id: 'user-4', email: 'unlinked@test.com', role: 'viewer' };
            
            mockGetDocs.mockImplementation(async (q: any) => {
                const path = q._query.path.segments[0];
                if (path === 'users') return { docs: [{ id: 'user-4', data: () => mockUser }] };
                if (path === 'properties') return { docs: [] };
                if (path === 'landlords') return { docs: [] };
                if (path === 'propertyOwners') return { docs: [] };
                return { docs: [] };
            });
    
            // Act
            const users = await data.getUsers();
            
            // Assert
            expect(users).toHaveLength(1);
            expect(users[0].role).toBe('viewer');
        });
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
                if (q._query.path.segments[0] === 'properties') {
                    return { docs: mockProperties.map(p => ({ id: p.id, data: () => p }))};
                }
                return { docs: [] };
            });

            const batch = createMockBatch();

            // Act
            await data.deleteLandlord(landlordId);

            // Assert
            expect(batch.commit).toHaveBeenCalled();
            expect(batch.delete).toHaveBeenCalledTimes(1); 
            expect(batch.update).toHaveBeenCalledTimes(2);
        });
    
        it('should throw an error if trying to delete the internal Soil Merchants profile', async () => {
            await expect(data.deleteLandlord('soil_merchants_internal')).rejects.toThrow(
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
            await data.deletePropertyOwner(ownerId);
            
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
        it('should add a water reading and update tenant balance', async () => {
            // Arrange
            const mockTenant = { id: 'tenant-1', name: 'Water Tenant', dueBalance: 1000, lease: { rent: 20000, paymentStatus: 'Pending', lastBilledPeriod: '2024-01', startDate: '2024-01-01', endDate: '2025-01-01' } };
            const mockProperty = { id: 'prop-1', name: 'Prop 1', units: [{ name: 'Unit 1' }] };
            const readingData = {
                propertyId: 'prop-1',
                unitName: 'Unit 1',
                priorReading: 100,
                currentReading: 120,
                date: '2024-02-15',
            };
            const expectedConsumption = 20;
            const expectedAmount = expectedConsumption * 150; // WATER_RATE
    
            // Mock Firestore calls
            mockGetDocs.mockResolvedValue({
                empty: false,
                docs: [{
                    id: 'tenant-1',
                    ref: { path: 'tenants/tenant-1'},
                    data: () => mockTenant,
                }],
            });
            
            const mockTransaction = {
                get: jest.fn().mockResolvedValue({
                    exists: () => true,
                    data: () => mockTenant,
                }),
                update: jest.fn(),
                set: jest.fn(),
            };
            mockRunTransaction.mockImplementation(async (db, updateFunction) => {
                await updateFunction(mockTransaction);
            });
    
            // Mock other dependencies
            jest.spyOn(data, 'getTenant').mockResolvedValue(mockTenant as any);
            jest.spyOn(data, 'getProperty').mockResolvedValue(mockProperty as any);
            jest.spyOn(data, 'logActivity').mockResolvedValue();
    
            // Act
            await data.addWaterMeterReading(readingData);
    
            // Assert
            // Check that a water reading was added
            const addDocCall = (addDoc as jest.Mock).mock.calls[0];
            expect(addDocCall[0]._path.segments.join('/')).toBe('waterReadings');
            expect(addDocCall[1]).toMatchObject({
                propertyId: 'prop-1',
                unitName: 'Unit 1',
                consumption: expectedConsumption,
                amount: expectedAmount,
                status: 'Pending'
            });
            
            // Check that the tenant's balance was updated correctly in the transaction
            const tenantUpdateCall = mockTransaction.update.mock.calls[0];
            const updatedData = tenantUpdateCall[1];
            expect(tenantUpdateCall[0].path).toBe('tenants/tenant-1'); // Check it updates the correct tenant
            expect(updatedData.dueBalance).toBe(1000 + expectedAmount);
            expect(updatedData['lease.paymentStatus']).toBe('Overdue'); 
        });
    });
});
