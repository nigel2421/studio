
import { getTenantsInArrears } from './arrears';
import { getTenants, getAllWaterReadings } from './data';
import { Tenant, WaterMeterReading } from './types';

jest.mock('./data', () => ({
  getTenants: jest.fn(),
  getAllWaterReadings: jest.fn(),
}));

const mockGetTenants = getTenants as jest.Mock;
const mockGetAllWaterReadings = getAllWaterReadings as jest.Mock;

describe('Arrears Logic', () => {
    
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should correctly calculate rent arrears by excluding pending water bills', async () => {
        // Tenant has 25,000 total due balance in DB
        // 20,000 is for Rent, 5,000 is for an unpaid Water bill
        const mockTenant = {
            id: 't1',
            name: 'John Doe',
            dueBalance: 25000,
            residentType: 'Tenant',
            email: 'john@test.com',
            propertyId: 'p1',
            unitName: 'A1',
            lease: { rent: 20000, paymentStatus: 'Overdue' }
        } as any;

        const mockWaterBill = {
            id: 'w1',
            tenantId: 't1',
            amount: 5000,
            status: 'Pending'
        } as any;

        mockGetTenants.mockResolvedValue([mockTenant]);
        mockGetAllWaterReadings.mockResolvedValue([mockWaterBill]);

        const result = await getTenantsInArrears();

        expect(result).toHaveLength(1);
        // Rent arrears should be 25,000 - 5,000 = 20,000
        expect(result[0].arrears).toBe(20000);
    });

    it('should return empty if total balance is fully accounted for by water bills', async () => {
        const mockTenant = { id: 't1', dueBalance: 5000 } as any;
        const mockWaterBill = { id: 'w1', tenantId: 't1', amount: 5000, status: 'Pending' } as any;

        mockGetTenants.mockResolvedValue([mockTenant]);
        mockGetAllWaterReadings.mockResolvedValue([mockWaterBill]);

        const result = await getTenantsInArrears();
        expect(result).toHaveLength(0);
    });
});
