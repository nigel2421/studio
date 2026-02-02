// Import all exports from data.ts to allow spying
import * as data from './data';

// Import types for mock data
import { Landlord, Property, PropertyOwner, UserProfile, Unit } from './types';

// Mock the entire 'firebase/firestore' module since it's a low-level dependency used by many functions
jest.mock('firebase/firestore', () => ({
    ...jest.requireActual('firebase/firestore'),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    doc: jest.fn(),
    writeBatch: jest.fn(),
    deleteDoc: jest.fn(),
    updateDoc: jest.fn(),
    deleteField: jest.fn(() => 'DELETE_FIELD_SENTINEL'), // Return a sentinel value for inspection
}));

// Import the mocked functions so we can manipulate them
import { getDoc, writeBatch } from 'firebase/firestore';

// --- Test Suite ---
describe('Data Logic in `data.ts`', () => {

    beforeEach(() => {
        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    // Test suite for the dynamic role assignment in getUsers
    describe('getUsers Role Differentiation', () => {
        it('should correctly identify a user as a "landlord"', async () => {
            // Arrange
            const mockUser: UserProfile = { id: 'user-1', email: 'investor@test.com', role: 'viewer', landlordId: 'landlord-1' };
            const mockLandlord: Landlord = { id: 'landlord-1', name: 'Investor Landlord', email: 'investor@test.com', phone: '111' };
            const mockInvestorUnit: Unit = { name: 'A1', ownership: 'Landlord', status: 'rented', landlordId: 'landlord-1', managementStatus: 'Rented for Clients', unitType: 'Studio' };
            const mockProperty: Property = { id: 'prop-1', name: 'Prop 1', address: 'addr', type: 'res', imageId: '1', units: [mockInvestorUnit] };
            
            // Spy on and mock the return values of functions called by getUsers
            jest.spyOn(data, 'getCollection').mockResolvedValue([mockUser] as any);
            jest.spyOn(data, 'getProperties').mockResolvedValue([mockProperty]);
            jest.spyOn(data, 'getLandlords').mockResolvedValue([mockLandlord]);
            jest.spyOn(data, 'getPropertyOwners').mockResolvedValue([]);

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
    
            jest.spyOn(data, 'getCollection').mockResolvedValue([mockUser] as any);
            jest.spyOn(data, 'getProperties').mockResolvedValue([mockProperty]);
            jest.spyOn(data, 'getLandlords').mockResolvedValue([]);
            jest.spyOn(data, 'getPropertyOwners').mockResolvedValue([mockOwner]);
    
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

            jest.spyOn(data, 'getCollection').mockResolvedValue([mockUser] as any);
            jest.spyOn(data, 'getProperties').mockResolvedValue([mockProperty]);
            jest.spyOn(data, 'getLandlords').mockResolvedValue([mockOwner]);
            jest.spyOn(data, 'getPropertyOwners').mockResolvedValue([]);

            // Act
            const users = await data.getUsers();
            
            // Assert
            expect(users).toHaveLength(1);
            expect(users[0].role).toBe('landlord');
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
            
            jest.spyOn(data, 'getLandlord').mockResolvedValue(mockLandlord);
            jest.spyOn(data, 'getProperties').mockResolvedValue(mockProperties);
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

            jest.spyOn(data, 'getPropertyOwner').mockResolvedValue(mockOwner);
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
});
