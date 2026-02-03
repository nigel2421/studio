
import { processServiceChargeData, groupAccounts } from './service-charge';
import type { Property, PropertyOwner, Tenant, Payment, Landlord, Unit, UnitType } from './types';
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

    // To make tests reliable, let's fix "today" to a specific date, e.g., March 15, 2024
    const runDate = parseISO('2024-03-15'); 
    const march2024 = startOfMonth(runDate);
    const feb2024 = startOfMonth(addMonths(runDate, -1));
    const jan2024 = startOfMonth(addMonths(runDate, -2));
    
    const march2024Formatted = format(march2024, 'yyyy-MM');
    const feb2024Formatted = format(feb2024, 'yyyy-MM');

    describe('processServiceChargeData with Handover Logic', () => {
        it('should correctly identify a unit as "Pending" when billable (handover > 10th)', () => {
            // Handover Feb 11th. March is waived. April is first billable month.
            const april2024 = addMonths(march2024, 1);
            const mockUnits = [ createMockUnit('A1', { status: 'client occupied', managementStatus: 'Client Managed', handoverStatus: 'Handed Over', serviceCharge: 2500, handoverDate: '2024-02-11' }) ];
            const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
            const mockOwners = [ createMockOwner('owner-1', 'Alice', [{ propertyId: 'prop-1', unitNames: ['A1']}]) ];
            const mockTenants = [ createMockHomeownerTenant('tenant-A1', 'prop-1', 'A1', 2500, march2024Formatted) ];
            
            // Run for April
            const { clientOccupiedServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, [], [], april2024);
            
            expect(clientOccupiedServiceChargeAccounts).toHaveLength(1);
            expect(clientOccupiedServiceChargeAccounts[0].paymentStatus).toBe('Pending');
        });

        it('should correctly identify a unit as "N/A" when month is waived (handover > 10th)', () => {
            // Handover Feb 11th. March is waived. Check for March.
            const mockUnits = [ createMockUnit('B1', { status: 'client occupied', managementStatus: 'Client Managed', handoverStatus: 'Handed Over', serviceCharge: 2500, handoverDate: '2024-02-11' }) ];
            const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
            const mockOwners = [ createMockOwner('owner-1', 'Alice', [{ propertyId: 'prop-1', unitNames: ['B1']}]) ];
            const mockTenants = [ createMockHomeownerTenant('tenant-B1', 'prop-1', 'B1', 2500, feb2024Formatted) ];
            
             // Run for March
            const { clientOccupiedServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, [], [], march2024);
            
            expect(clientOccupiedServiceChargeAccounts).toHaveLength(1);
            expect(clientOccupiedServiceChargeAccounts[0].paymentStatus).toBe('N/A');
        });

         it('should correctly identify a unit as "Pending" when billable (handover <= 10th)', () => {
            // Handover March 10th. March is waived. April is first billable month.
            const april2024 = addMonths(march2024, 1);
            const mockUnits = [ createMockUnit('C1', { status: 'client occupied', managementStatus: 'Client Managed', handoverStatus: 'Handed Over', serviceCharge: 2500, handoverDate: '2024-03-10' }) ];
            const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
            const mockOwners = [ createMockOwner('owner-1', 'Alice', [{ propertyId: 'prop-1', unitNames: ['C1']}]) ];
            const mockTenants = [ createMockHomeownerTenant('tenant-C1', 'prop-1', 'C1', 2500, march2024Formatted) ];
            
             // Run for April
            const { clientOccupiedServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, [], [], april2024);
            
            expect(clientOccupiedServiceChargeAccounts).toHaveLength(1);
            expect(clientOccupiedServiceChargeAccounts[0].paymentStatus).toBe('Pending');
        });

        it('should correctly identify a unit as "N/A" when month is waived (handover <= 10th)', () => {
            // Handover March 10th. March is waived. Check for March.
            const mockUnits = [ createMockUnit('D1', { status: 'client occupied', managementStatus: 'Client Managed', handoverStatus: 'Handed Over', serviceCharge: 2500, handoverDate: '2024-03-10' }) ];
            const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
            const mockOwners = [ createMockOwner('owner-1', 'Alice', [{ propertyId: 'prop-1', unitNames: ['D1']}]) ];
            const mockTenants = [ createMockHomeownerTenant('tenant-D1', 'prop-1', 'D1', 2500, feb2024Formatted) ];
            
            // Run for March
            const { clientOccupiedServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, [], [], march2024);
            
            expect(clientOccupiedServiceChargeAccounts).toHaveLength(1);
            expect(clientOccupiedServiceChargeAccounts[0].paymentStatus).toBe('N/A');
        });
    });

    test('should identify managed vacant units and determine payment status', () => {
        // Test-specific data
        const mockOwners = [ createMockOwner('owner-2', 'Bob', [{ propertyId: 'prop-1', unitNames: ['B201', 'B202']}]) ];
        const mockUnits = [
            createMockUnit('B201', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: format(jan2024, 'yyyy-MM-dd') }),
            createMockUnit('B202', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: format(jan2024, 'yyyy-MM-dd') }),
        ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
        const mockTenants = [ createMockHomeownerTenant('tenant-B202', 'prop-1', 'B202', 3000, feb2024Formatted) ];
        const mockPayments = [ createMockPayment('tenant-B202', 3000, 'ServiceCharge', format(march2024, 'yyyy-MM-dd'), march2024Formatted) ];
        
        const { managedVacantServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, mockPayments, [], march2024);

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

    test('should calculate arrears for vacant, handed-over units correctly', () => {
        const handoverDate = '2024-01-11'; // After 10th, so Feb is waived, March is first billable
        const mockLandlords = [ createMockLandlord('landlord-1', 'Charlie') ];
        const mockUnits = [ 
            createMockUnit('C301', { 
                ownership: 'Landlord', 
                status: 'vacant', 
                managementStatus: 'Rented for Clients', 
                handoverStatus: 'Handed Over', 
                handoverDate: handoverDate,
                serviceCharge: 1500, 
                landlordId: 'landlord-1' 
            }) 
        ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
        const may2024 = parseISO('2024-05-15');

        // Check arrears as of May 2024. Billable months are March, April, May.
        const { vacantArrears } = processServiceChargeData(mockProperties, [], [], [], mockLandlords, may2024);
        
        expect(vacantArrears).toHaveLength(1);
        const arrearsAccount = vacantArrears[0];
        expect(arrearsAccount.unitName).toBe('C301');
        expect(arrearsAccount.monthsInArrears).toBe(3); 
        expect(arrearsAccount.totalDue).toBe(4500); // 1500 * 3
    });

    test('should correctly group multiple accounts for one owner', () => {
        const mockOwners = [ createMockOwner('owner-2', 'Bob', [{ propertyId: 'prop-1', unitNames: ['B201', 'B202']}]) ];
        const mockUnits = [
            createMockUnit('B201', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: format(jan2024, 'yyyy-MM-dd') }),
            createMockUnit('B202', { status: 'vacant', managementStatus: 'Rented for Clients', handoverStatus: 'Handed Over', serviceCharge: 3000, handoverDate: format(jan2024, 'yyyy-MM-dd') }),
        ];
        const mockProperties = [ createMockProperty('prop-1', mockUnits) ];
        const mockTenants = [ createMockHomeownerTenant('tenant-B202', 'prop-1', 'B202', 3000, feb2024Formatted) ];
        const mockPayments = [ createMockPayment('tenant-B202', 3000, 'ServiceCharge', format(march2024, 'yyyy-MM-dd'), march2024Formatted) ];
        
        const { managedVacantServiceChargeAccounts } = processServiceChargeData(mockProperties, mockOwners, mockTenants, mockPayments, [], march2024);
        const grouped = groupAccounts(managedVacantServiceChargeAccounts);

        const bobGroup = grouped.find(g => g.ownerName === 'Bob');
        expect(bobGroup).toBeDefined();
        expect(bobGroup?.units).toHaveLength(2);
        expect(bobGroup?.totalServiceCharge).toBe(6000);
        expect(bobGroup?.paymentStatus).toBe('Pending'); // Because B201 is pending
    });
});
