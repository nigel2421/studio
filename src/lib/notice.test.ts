import { processOverdueNotices, getDocs, doc, writeBatch, getDoc, collection, query, where, updateDoc, addDoc } from './data';
import { Tenant, Property, NoticeToVacate, Unit } from './types';
import { format, subDays } from 'date-fns';

jest.mock('firebase/firestore', () => {
    const originalModule = jest.requireActual('firebase/firestore');
    return {
        ...originalModule,
        getDocs: jest.fn(),
        getDoc: jest.fn(),
        doc: jest.fn((db, collectionName, id) => ({ path: `${collectionName}/${id}`, id: id })),
        writeBatch: jest.fn(),
        collection: jest.fn(),
        query: jest.fn(),
        where: jest.fn(),
        updateDoc: jest.fn(),
        addDoc: jest.fn(), // Mock addDoc for logging
    };
});

const mockGetDocs = getDocs as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;
const mockWriteBatch = writeBatch as jest.Mock;
const mockAddDoc = jest.requireMock('firebase/firestore').addDoc;


describe('Notice to Vacate Processing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should process an overdue notice correctly', async () => {
        // Arrange
        const today = new Date();
        const overdueDate = format(subDays(today, 2), 'yyyy-MM-dd');
        const editorId = 'admin-user-id';

        const mockNotice: NoticeToVacate = {
            id: 'notice-1',
            tenantId: 'tenant-1',
            propertyId: 'prop-1',
            unitName: 'A101',
            tenantName: 'John Doe',
            propertyName: 'Test Property',
            noticeSubmissionDate: format(subDays(today, 32), 'yyyy-MM-dd'),
            scheduledMoveOutDate: overdueDate,
            submittedBy: 'Tenant',
            submittedByName: 'John Doe',
            status: 'Active',
        };

        const mockTenant = { id: 'tenant-1', name: 'John Doe', email: 'johndoe@test.com', propertyId: 'prop-1', unitName: 'A101' } as Tenant;
        const mockProperty = {
            id: 'prop-1',
            name: 'Test Property',
            units: [{ name: 'A101', status: 'rented' }, { name: 'A102', status: 'vacant' }]
        } as Property;

        mockGetDocs.mockResolvedValue({
            docs: [{ id: 'notice-1', data: () => mockNotice }]
        });

        mockGetDoc.mockImplementation(ref => {
            if (ref.path.includes('tenants/')) return Promise.resolve({ exists: () => true, data: () => mockTenant });
            if (ref.path.includes('properties/')) return Promise.resolve({ exists: () => true, data: () => mockProperty });
            return Promise.resolve({ exists: () => false });
        });
        
        const batchOperations = {
            update: jest.fn(),
            set: jest.fn(),
            delete: jest.fn(),
            commit: jest.fn().mockResolvedValue(undefined),
        };
        mockWriteBatch.mockReturnValue(batchOperations);
        mockAddDoc.mockResolvedValue({ id: 'log-id' }); // Mock addDoc for logging

        // Act
        const result = await processOverdueNotices(editorId);

        // Assert
        expect(result).toEqual({ processedCount: 1, errorCount: 0 });

        // Verify notice is updated
        expect(batchOperations.update).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'noticesToVacate/notice-1' }),
            { status: 'Completed' }
        );

        // Verify tenant is archived
        expect(batchOperations.set).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'archived_tenants/tenant-1' }),
            expect.objectContaining({ ...mockTenant, status: 'archived' })
        );

        // Verify tenant is deleted
        expect(batchOperations.delete).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'tenants/tenant-1' })
        );

        // Verify unit is updated
        const expectedUpdatedUnits = [
            { name: 'A101', status: 'vacant' },
            { name: 'A102', status: 'vacant' },
        ];
        expect(batchOperations.update).toHaveBeenCalledWith(
            expect.objectContaining({ path: 'properties/prop-1' }),
            { units: expect.arrayContaining(expectedUpdatedUnits) }
        );
        
        // Verify batch was committed
        expect(batchOperations.commit).toHaveBeenCalled();

        // Verify activity was logged (since it's not in the batch)
        expect(mockAddDoc).toHaveBeenCalledWith(
            undefined, // In our mock, db is undefined, which is fine for this check.
            expect.objectContaining({ action: `Processed move-out for ${mockTenant.name} in unit ${mockTenant.unitName}.` })
        );
    });

    it('should handle cases where no notices are overdue', async () => {
        mockGetDocs.mockResolvedValue({ docs: [] });
        const result = await processOverdueNotices('admin-user-id');
        expect(result).toEqual({ processedCount: 0, errorCount: 0 });
    });
});
