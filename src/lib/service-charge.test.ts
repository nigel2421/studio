
import { processServiceChargeData, groupAccounts } from './service-charge';
import type { Property, PropertyOwner, Tenant, Payment, Landlord, Unit } from './types';
import { startOfMonth, addMonths, format, parseISO, isValid } from 'date-fns';

// Helper to create mock data, ensuring consistency
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

const createMockLandlord = (id: string, name: string): Landlord => ({
    id,
    name,
    email: `${name.toLowerCase().replace(' ', '')}@test.com`,
    phone: '987654321',
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

const createMockPayment = (tenantId: string, amount: number, type: Payment['type'], date: string, rentForMonth: string): Payment => ({
    id: `payment-${Math.random()}`,
    tenantId,
    amount,
    date,
    type,
    status: 'Paid',
    rentForMonth,
    paymentMethod: 'M-Pesa',
    transactionId: `TRANS${Math.random()}`,
    createdAt: new Date(),
});


describe('Service Charge Logic', () => {

    const today = new Date();
    const thisMonth = startOfMonth(today);
    const lastMonth = startOfMonth(addMonths(today, -1));
    const twoMonthsAgo = startOfMonth(addMonths(today, -2));

    const thisMonthFormatted = format(thisMonth, 'yyyy-MM');
    const lastMonthFormatted = format(lastMonth, 'yyyy-MM');


    test('should identify client occupied units and determine payment status', () => {
        // Test-specific data
        const mockOwners = [ createMockOwner('owner-1', 'Alice', [{ propertyId: 'prop-1', unitNames: ['A101']}]) ];
        const mockUnits = [ createMockUnit('A101', { status: 'client occupied', managementStatus: 'Client Managed', handoverStatus: 'Handed Over', serviceCharge: 2500 }) ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
        const mockTenants = [ createMockHomeownerTenant('tenant-A101', 'prop-1', 'A101', 2500, lastMonthFormatted) ];
        
        const { clientOccupiedServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, [], [], thisMonth);
        
        expect(clientOccupiedServiceChargeAccounts).toHaveLength(1);
        const account = clientOccupiedServiceChargeAccounts[0];
        expect(account.unitName).toBe('A101');
        expect(account.ownerName).toBe('Alice');
        expect(account.paymentStatus).toBe('Pending'); // No payment was mocked for this month
    });

    test('should identify managed vacant units and determine payment status', () => {
        // Test-specific data
        const mockOwners = [ createMockOwner('owner-2', 'Bob', [{ propertyId: 'prop-1', unitNames: ['B201', 'B202']}]) ];
        const mockUnits = [
            createMockUnit('B201', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: format(twoMonthsAgo, 'yyyy-MM-dd') }),
            createMockUnit('B202', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: format(twoMonthsAgo, 'yyyy-MM-dd') }),
        ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
        const mockTenants = [ createMockHomeownerTenant('tenant-B202', 'prop-1', 'B202', 3000, lastMonthFormatted) ];
        const mockPayments = [ createMockPayment('tenant-B202', 3000, 'ServiceCharge', format(thisMonth, 'yyyy-MM-dd'), thisMonthFormatted) ];
        
        const { managedVacantServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, mockPayments, [], thisMonth);

        expect(managedVacantServiceChargeAccounts).toHaveLength(2);
        
        const unpaidAccount = managedVacantServiceChargeAccounts.find(a => a.unitName === 'B201');
        expect(unpaidAccount).toBeDefined();
        expect(unpaidAccount?.ownerName).toBe('Bob');
        expect(unpaidAccount?.paymentStatus).toBe('Pending');

        const paidAccount = managedVacantServiceChargeAccounts.find(a => a.unitName === 'B202');
        expect(paidAccount).toBeDefined();
        expect(paidAccount?.ownerName).toBe('Bob');
        expect(paidAccount?.paymentStatus).toBe('Paid');
    });

    test('should calculate arrears for vacant, handed-over units', () => {
        const twoMonthsAgo = startOfMonth(addMonths(new Date(), -2));
        const mockLandlords = [ createMockLandlord('landlord-1', 'Charlie') ];
        const mockUnits = [ 
            createMockUnit('C301', { 
                ownership: 'Landlord', 
                status: 'vacant', 
                managementStatus: 'Rented for Clients', 
                handoverStatus: 'Handed Over', 
                handoverDate: format(twoMonthsAgo, 'yyyy-MM-05'),
                serviceCharge: 1500, 
                landlordId: 'landlord-1' 
            }) 
        ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];

        // Pass `thisMonth` to check arrears up to the beginning of the current month
        const { vacantArrears } = processServiceChargeData(mockProperties, [], [], [], mockLandlords, thisMonth);
        
        expect(vacantArrears).toHaveLength(1);
        const arrearsAccount = vacantArrears[0];
        expect(arrearsAccount.unitName).toBe('C301');
        // If handed over 2 months ago (e.g. May 5th, and it's now July), arrears are for May and June.
        expect(arrearsAccount.monthsInArrears).toBe(2); 
        expect(arrearsAccount.totalDue).toBe(3000);
    });

    test('should correctly group multiple accounts for one owner', () => {
        const mockOwners = [ createMockOwner('owner-2', 'Bob', [{ propertyId: 'prop-1', unitNames: ['B201', 'B202']}]) ];
        const mockUnits = [
            createMockUnit('B201', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: format(twoMonthsAgo, 'yyyy-MM-dd') }),
            createMockUnit('B202', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: format(twoMonthsAgo, 'yyyy-MM-dd') }),
        ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
        const mockTenants = [ createMockHomeownerTenant('tenant-B202', 'prop-1', 'B202', 3000, lastMonthFormatted) ];
        const mockPayments = [ createMockPayment('tenant-B202', 3000, 'ServiceCharge', format(thisMonth, 'yyyy-MM-dd'), thisMonthFormatted) ];
        
        const { managedVacantServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, mockPayments, [], thisMonth);
        const grouped = groupAccounts(managedVacantServiceChargeAccounts);

        const bobGroup = grouped.find(g => g.ownerName === 'Bob');
        expect(bobGroup).toBeDefined();
        expect(bobGroup?.units).toHaveLength(2);
        expect(bobGroup?.totalServiceCharge).toBe(6000);
        expect(bobGroup?.paymentStatus).toBe('Pending'); // Because B201 is pending
    });
});

    