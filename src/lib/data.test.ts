
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
    batchProcessPayments
} from './data';
import { cacheService } from './cache'; 

// Import types for mock data
import { Landlord, Property, PropertyOwner, UserProfile, Unit, Payment, Tenant } from './types';
import { runTransaction } from 'firebase/firestore';
import { format } from 'date-fns';

// Mock the entire 'firebase/firestore' module
jest.mock('firebase/firestore', () => ({
    ...jest.requireActual('firebase/firestore'),
    getFirestore: jest.fn(() => ({})),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    doc: jest.fn((db, collection, id) => ({
        path: `${collection}/${id}`,
        id: id
    })),
    writeBatch: jest.fn(),
    deleteDoc: jest.fn(),
    updateDoc: jest.fn(),
    addDoc: jest.fn(),
    runTransaction: jest.fn(),
    collection: jest.fn((db, path) => ({
        _path: { segments: [path] },
    })),
    query: jest.fn((coll, ...constraints) => ({ ...coll, _constraints: constraints })),
    where: jest.fn((field, op, value) => ({ field, op, value })),
    deleteField: jest.fn(() => 'DELETE_FIELD_SENTINEL'),
}));

// Import the mocked functions so we can manipulate them
import { getDoc, writeBatch, getDocs, updateDoc, addDoc } from 'firebase/firestore';

const mockGetDocs = getDocs as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const mockRunTransaction = runTransaction as jest.Mock;

describe('Data Logic in `data.ts`', () => {

    beforeEach(() => {
        jest.clearAllMocks();
        cacheService.clear();
    });

    describe('batchProcessPayments with WaterDeposit', () => {
        it('should correctly process multiple payments including WaterDeposit', async () => {
            const tenantId = 't1';
            // We provide a complete lease mock to prevent reconcileMonthlyBilling from adding unexpected charges
            const mockTenant = { 
                id: tenantId, 
                dueBalance: 25000, 
                accountBalance: 0, 
                propertyId: 'p1', 
                unitName: 'A1',
                lease: { 
                    rent: 20000, 
                    paymentStatus: 'Overdue',
                    startDate: '2020-01-01',
                    lastBilledPeriod: format(new Date(), 'yyyy-MM') // Already billed for this period
                }
            };
            
            mockGetDoc.mockResolvedValue({ 
                exists: () => true, 
                id: tenantId, 
                data: () => mockTenant 
            });

            const entries = [
                { amount: 20000, date: format(new Date(), 'yyyy-MM-dd'), type: 'Rent', paymentMethod: 'M-Pesa', transactionId: 'TX1' },
                { amount: 5000, date: format(new Date(), 'yyyy-MM-dd'), type: 'WaterDeposit', paymentMethod: 'M-Pesa', transactionId: 'TX2' }
            ];

            const mockTx = {
                set: jest.fn(),
                update: jest.fn(),
                get: jest.fn()
            };
            mockRunTransaction.mockImplementation((db, fn) => fn(mockTx));

            await batchProcessPayments(tenantId, entries);

            // Verify both payments were recorded
            expect(mockTx.set).toHaveBeenCalledTimes(2);
            // Verify balance update
            expect(mockTx.update).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
                dueBalance: 0,
                accountBalance: 0
            }));
        });
    });

    describe('Data Deletion Functions', () => {
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
            const landlordId = 'landlord-1';
            const mockLandlord: Landlord = { id: landlordId, name: 'Test Landlord', email: 'test@l.com', phone: '123' };
            const mockProperties: Property[] = [
                { id: 'prop-1', name: 'Prop 1', address: '', type: '', imageId: '', units: [{ name: 'A1', landlordId: landlordId, status: 'rented', ownership: 'Landlord', unitType: 'Studio' }] },
            ];

            mockGetDoc.mockResolvedValue({ exists: () => true, data: () => mockLandlord });
            mockGetDocs.mockResolvedValue({ docs: mockProperties.map(p => ({ id: p.id, data: () => p })) });

            const batch = createMockBatch();
            await deleteLandlord(landlordId);

            expect(batch.commit).toHaveBeenCalled();
            expect(batch.delete).toHaveBeenCalledTimes(1);
        });
    });
});
