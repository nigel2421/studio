import { getTenantsInArrears, getLandlordArrearsBreakdown } from './arrears';
import { getTenants, getProperties } from './data';
import { Tenant, Property, Unit } from './types';

// Mock the data fetching functions
jest.mock('./data', () => ({
  getTenants: jest.fn(),
  getProperties: jest.fn(),
}));

const mockGetTenants = getTenants as jest.Mock;
const mockGetProperties = getProperties as jest.Mock;

// Helper to create mock data
const createMockTenant = (id: string, dueBalance: number, propertyId = 'prop-1', unitName = 'A1'): Tenant => ({
  id,
  name: `Tenant ${id}`,
  email: `tenant${id}@test.com`,
  phone: '123',
  idNumber: '123',
  propertyId,
  unitName,
  agent: 'Susan',
  status: 'active',
  securityDeposit: 20000,
  waterDeposit: 5000,
  residentType: 'Tenant',
  lease: {
    startDate: '2023-01-01',
    endDate: '2024-01-01',
    rent: 20000,
    paymentStatus: dueBalance > 0 ? 'Overdue' : 'Paid',
    lastBilledPeriod: '2023-10',
  },
  accountBalance: 0,
  dueBalance,
});

const createMockUnit = (name: string, landlordId?: string, handoverStatus: 'Handed Over' | 'Pending Hand Over' = 'Handed Over', serviceCharge = 1000): Unit => ({
    name,
    status: 'vacant',
    ownership: 'Landlord',
    unitType: 'One Bedroom',
    landlordId,
    handoverStatus,
    serviceCharge,
});

describe('Arrears Logic', () => {
    
    beforeEach(() => {
        // Clear all mocks before each test
        mockGetTenants.mockClear();
        mockGetProperties.mockClear();
    });

    describe('getTenantsInArrears', () => {
        it('should return only tenants with a dueBalance greater than 0', async () => {
            const tenants = [
                createMockTenant('1', 5000),
                createMockTenant('2', 0),
                createMockTenant('3', 10000),
                createMockTenant('4', -100), // Credit
            ];
            mockGetTenants.mockResolvedValue(tenants);

            const result = await getTenantsInArrears();

            expect(result).toHaveLength(2);
            expect(result.map(r => r.tenant.id)).toEqual(['3', '1']); // Sorted by arrears descending
        });

        it('should return an empty array when no tenants are in arrears', async () => {
            const tenants = [
                createMockTenant('1', 0),
                createMockTenant('2', -50),
            ];
            mockGetTenants.mockResolvedValue(tenants);

            const result = await getTenantsInArrears();
            expect(result).toHaveLength(0);
        });
    });

    describe('getLandlordArrearsBreakdown', () => {
        it('should calculate arrears for occupied units and service charges for vacant units', async () => {
            const landlordId = 'landlord-A';
            const properties: Property[] = [{
                id: 'prop-1', name: 'Test Property', address: '123 St', type: 'Residential', imageId: '1',
                units: [
                    createMockUnit('A1', landlordId), // Vacant
                    createMockUnit('A2', landlordId), // Occupied
                    createMockUnit('B1', 'other-landlord'),
                    createMockUnit('A3', landlordId, 'Pending Hand Over', 2000), // Vacant, but not handed over
                ],
            }];
            const tenants: Tenant[] = [
                createMockTenant('t-A2', 5000, 'prop-1', 'A2'),
            ];

            mockGetProperties.mockResolvedValue(properties);
            mockGetTenants.mockResolvedValue(tenants);

            const result = await getLandlordArrearsBreakdown(landlordId);

            expect(result.totalTenantArrears).toBe(5000);
            expect(result.vacantUnitServiceCharge).toBe(1000); // Only from unit A1
            expect(result.totalDeductions).toBe(6000);
            
            const breakdownForA1 = result.breakdown.find(b => b.unit.name === 'A1');
            expect(breakdownForA1?.tenant).toBeUndefined();
            expect(breakdownForA1?.tenantArrears).toBe(0);
            expect(breakdownForA1?.vacantServiceCharge).toBe(1000);
            
            const breakdownForA2 = result.breakdown.find(b => b.unit.name === 'A2');
            expect(breakdownForA2?.tenant?.id).toBe('t-A2');
            expect(breakdownForA2?.tenantArrears).toBe(5000);
            expect(breakdownForA2?.vacantServiceCharge).toBe(0);
            
            const breakdownForA3 = result.breakdown.find(b => b.unit.name === 'A3');
            expect(breakdownForA3?.vacantServiceCharge).toBe(0); // Because not handed over

            expect(result.breakdown).toHaveLength(3); // Should not include B1
        });
    });
});
