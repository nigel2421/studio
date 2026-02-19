import { processServiceChargeData, groupAccounts } from './service-charge';
import type { Property, PropertyOwner, Tenant, Payment, Landlord, Unit } from './types';
import { startOfMonth, addMonths, format, parseISO, isValid } from 'date-fns';

const createMockUnit = (name: string, overrides: Partial<Unit>): Unit => ({
    name,
    status: 'vacant',
    ownership: 'Landlord',
    unitType: 'One Bedroom',
    managementStatus: 'Rented for Clients',
    handoverStatus: 'Pending Hand Over',
    serviceCharge: 2000,
    ...overrides
});

const createMockProperty = (id: string, units: Unit[]): Property => ({
    id,
    name: `Property ${id}`,
    address: '123 Test St',
    type: 'Residential',
    imageId: '1',
    units,
});

const createMockOwner = (id: string, name: string, assignedUnits: { propertyId: string, unitNames: string[] }[]): PropertyOwner => ({
    id,
    name,
    email: `${name.toLowerCase().replace(' ', '')}@test.com`,
    phone: '123456789',
    assignedUnits,
});

const createMockHomeownerTenant = (id: string, propertyId: string, unitName: string, serviceCharge: number, lastBilledPeriod: string): Tenant => ({
    id,
    name: `Homeowner ${id}`,
    email: `homeowner${id}@test.com`,
    phone: '555-1234',
    idNumber: '12345',
    propertyId,
    unitName,
    agent: 'Susan',
    status: 'active',
    residentType: 'Homeowner',
    lease: {
        startDate: '2023-01-01',
        endDate: '2099-01-01',
        rent: 0,
        serviceCharge,
        paymentStatus: 'Paid',
        lastBilledPeriod,
    },
    securityDeposit: 0,
    waterDeposit: 0,
    dueBalance: 0,
    accountBalance: 0,
});

describe('Service Charge Logic', () => {
    const runDate = parseISO('2024-03-15'); 
    const march2024 = startOfMonth(runDate);
    const feb2024Formatted = format(addMonths(runDate, -1), 'yyyy-MM');

    it('should correctly identify a unit as "N/A" when month is waived (handover logic)', () => {
        // Handover March 10th. March is waived. Check for March.
        const mockUnits = [ createMockUnit('D1', { status: 'client occupied', managementStatus: 'Client Managed', handoverStatus: 'Handed Over', serviceCharge: 2500, handoverDate: '2024-03-10' }) ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
        const mockOwners = [ createMockOwner('owner-1', 'Alice', [{ propertyId: 'prop-1', unitNames: ['D1']}]) ];
        const mockTenants = [ createMockHomeownerTenant('tenant-D1', 'prop-1', 'D1', 2500, feb2024Formatted) ];
        
        const { clientOccupiedServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, [], [], march2024);
        
        expect(clientOccupiedServiceChargeAccounts).toHaveLength(1);
        expect(clientOccupiedServiceChargeAccounts[0].paymentStatus).toBe('N/A');
    });

    it('should group multiple accounts for one owner and roll up status', () => {
        const mockOwners = [ createMockOwner('owner-2', 'Bob', [{ propertyId: 'prop-1', unitNames: ['B201', 'B202']}]) ];
        const mockUnits = [
            createMockUnit('B201', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: '2024-01-01' }),
            createMockUnit('B202', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: '2024-01-01' }),
        ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
        
        // No payments recorded -> Status should be Pending
        const { managedVacantServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, [], [], [], march2024);
        const grouped = groupAccounts(managedVacantServiceChargeAccounts);

        const bobGroup = grouped.find(g => g.ownerName === 'Bob');
        expect(bobGroup?.paymentStatus).toBe('Pending');
        expect(bobGroup?.totalServiceCharge).toBe(6000);
    });
});