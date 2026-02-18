
import { processOverdueNotices } from './data';
import { NoticeToVacate } from './types';
import { format, subDays } from 'date-fns';
import { getDocs, doc, writeBatch, getDoc } from 'firebase/firestore';

jest.mock('firebase/firestore', () => ({
    ...jest.requireActual('firebase/firestore'),
    getDocs: jest.fn(),
    getDoc: jest.fn(),
    doc: jest.fn((db, collectionName, id) => ({ path: `${collectionName}/${id}`, id: id })),
    writeBatch: jest.fn(),
    collection: jest.fn((db, path) => ({ path })),
    query: jest.fn(),
    where: jest.fn(),
    updateDoc: jest.fn(),
    addDoc: jest.fn(),
}));

const mockGetDocs = getDocs as jest.Mock;
const mockGetDoc = getDoc as jest.Mock;

describe('Notice to Vacate Processing', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should process an overdue notice correctly', async () => {
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

        const mockTenant = { id: 'tenant-1', name: 'John Doe', email: 'johndoe@test.com', propertyId: 'prop-1', unitName: 'A101' };
        const mockProperty = {
            id: 'prop-1',
            name: 'Test Property',
            units: [{ name: 'A101', status: 'rented' }, { name: 'A102', status: 'vacant' }]
        };

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
        (writeBatch as jest.Mock).mockReturnValue(batchOperations);

        const result = await processOverdueNotices(editorId);

        expect(result).toEqual({ processedCount: 1, errorCount: 0 });
        expect(batchOperations.commit).toHaveBeenCalled();
    });

    it('should handle cases where no notices are overdue', async () => {
        mockGetDocs.mockResolvedValue({ docs: [] });
        const result = await processOverdueNotices('admin-user-id');
        expect(result).toEqual({ processedCount: 0, errorCount: 0 });
    });
});
