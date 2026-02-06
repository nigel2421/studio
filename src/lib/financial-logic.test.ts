
import { generateLedger, reconcileMonthlyBilling, validatePayment } from './financial-logic';
import { Tenant, Unit, Payment, Property, Lease, PropertyOwner, Landlord } from './types';
import { parseISO, format, addMonths } from 'date-fns';

// Define a more specific type for the overrides to help TypeScript
type MockTenantOverrides = Omit<Partial<Tenant>, 'lease'> & {
    lease?: Partial<Lease>;
};

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


// Helper to create mock data with simplified inputs
const createMockTenant = (overrides: MockTenantOverrides = {}): Tenant => {
    const defaultLease: Lease = {
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        rent: 20000,
        paymentStatus: 'Paid',
        lastBilledPeriod: '2023-12',
    };

    const defaultTenant: Omit<Tenant, 'lease'> = {
        id: 'test-tenant',
        name: 'Test Tenant',
        email: 'test@tenant.com',
        phone: '123',
        idNumber: '123',
        propertyId: 'prop-1',
        unitName: 'Test Unit',
        agent: 'Susan',
        status: 'active',
        residentType: 'Tenant',
        securityDeposit: 0,
        waterDeposit: 0,
        accountBalance: 0,
        dueBalance: 0,
    };

    // Separate lease overrides from other tenant property overrides
    const { lease: leaseOverrides, ...tenantOverrides } = overrides;

    return {
        ...defaultTenant, // Apply default tenant properties
        ...tenantOverrides, // Apply specific tenant property overrides
        lease: {
            ...defaultLease, // Apply default lease properties
            ...leaseOverrides, // Apply specific lease property overrides
        },
    };
};


const createMockUnit = (overrides: Partial<Unit>): Unit => ({
    name: 'Test Unit',
    status: 'rented',
    ownership: 'Landlord',
    unitType: 'One Bedroom',
    ...overrides,
});

const createMockProperty = (id: string, units: Unit[]): Property => ({
    id,
    name: `Property ${id}`,
    address: '123 Test St',
    type: 'Residential',
    imageId: '1',
    units,
});


const createMockPayment = (overrides: Partial<Payment>): Payment => ({
    id: 'test-payment',
    tenantId: 'test-tenant',
    amount: 20000,
    date: '2023-01-05',
    type: 'Rent',
    status: 'Paid',
    createdAt: new Date(),
    paymentMethod: 'M-Pesa',
    transactionId: 'TEST12345',
    ...overrides,
});


describe('Financial Logic', () => {

    describe('reconcileMonthlyBilling', () => {
        it('should bill for the current month if run on the 1st', () => {
            const tenant = createMockTenant({ lease: { lastBilledPeriod: '2024-01' } });
            const today = parseISO('2024-02-01');
            const updates = reconcileMonthlyBilling(tenant, undefined, today);
            
            expect(updates['lease.lastBilledPeriod']).toBe('2024-02');
            expect(updates.dueBalance).toBe(20000);
        });

        it('should correctly set status to Overdue if unpaid after the 5th', () => {
            const tenant = createMockTenant({ dueBalance: 20000, lease: { paymentStatus: 'Pending' }});
            const today = parseISO('2024-02-06');
            const updates = reconcileMonthlyBilling(tenant, undefined, today);

            // No new billing, but status should update
            expect(updates['lease.paymentStatus']).toBe('Overdue');
        });

        it('should not bill for future months', () => {
            const tenant = createMockTenant({ lease: { lastBilledPeriod: '2024-02' } });
            const today = parseISO('2024-02-15');
            const updates = reconcileMonthlyBilling(tenant, undefined, today);
            
            // No new charges should be added in Feb for March
            expect(updates['lease.lastBilledPeriod']).toBeUndefined();
            expect(updates.dueBalance).toBeUndefined();
        });
    });

    describe('generateLedger', () => {
        const mockProperty = createMockProperty('prop-1', [
            createMockUnit({ name: 'A1', rentAmount: 25000 }),
        ]);

        it('should order transactions chronologically', () => {
            const tenant = createMockTenant({ 
                unitName: 'A1',
                propertyId: 'prop-1',
                lease: { startDate: '2024-01-01', rent: 25000 } 
            });
            const payments = [
                createMockPayment({ amount: 25000, date: '2024-02-04', tenantId: tenant.id }), // Feb payment
                createMockPayment({ amount: 25000, date: '2024-01-05', tenantId: tenant.id }), // Jan payment
            ];
            const { ledger } = generateLedger(tenant, payments, [mockProperty], [], undefined, parseISO('2024-02-28'));

            // Check order
            const janPaymentIndex = ledger.findIndex(l => l.description.includes('Payment Received') && new Date(l.date).getMonth() === 0);
            const febPaymentIndex = ledger.findIndex(l => l.description.includes('Payment Received') && new Date(l.date).getMonth() === 1);
            
            expect(janPaymentIndex).toBeLessThan(febPaymentIndex);
        });

        it('should correctly break down an initial lump-sum payment', () => {
            const tenant = createMockTenant({ 
                propertyId: 'prop-1',
                unitName: 'A1',
                lease: { startDate: '2023-10-01', rent: 25000 },
                securityDeposit: 25000,
                waterDeposit: 5000,
                dueBalance: 0,
            });
            const payment = createMockPayment({
                tenantId: tenant.id,
                amount: 130000,
                date: '2023-10-02',
            });
            
            const asOfDate = parseISO('2024-01-31');
            const { ledger, finalDueBalance } = generateLedger(tenant, [payment], [mockProperty], [], undefined, asOfDate);
            
            const chargeDescriptions = ledger.map(l => l.description);
            expect(chargeDescriptions).toContain('Security Deposit');
            expect(chargeDescriptions).toContain('Water Deposit');
            
            // Should have charges for Oct, Nov, Dec, Jan
            expect(ledger.filter(l => l.description.startsWith('Rent for Units') && l.charge > 0)).toHaveLength(4);
            
            // The last entry should reflect the balance after all charges and payments up to that point
            const lastEntry = ledger[ledger.length - 1];
            expect(lastEntry.balance).toBe(0);
            expect(finalDueBalance).toBe(0);
        });
    });

    describe('generateLedger for Homeowners without tenant records', () => {
        it('should generate service charge bills even if no homeowner tenant record exists yet', () => {
            const mockUnit = createMockUnit({ name: 'H1', serviceCharge: 3000, handoverStatus: 'Handed Over', handoverDate: '2024-01-01' });
            const mockProperty = createMockProperty('prop-h', [mockUnit]);
            const mockOwner = createMockOwner('owner-h1', 'Home Owner 1', [{ propertyId: 'prop-h', unitNames: ['H1'] }]);
            
            // Create a "dummy" tenant as the dialog would
            const dummyTenant: Tenant = {
                id: `dummy-${mockOwner.id}`,
                name: mockOwner.name,
                email: mockOwner.email,
                phone: mockOwner.phone,
                idNumber: 'N/A',
                residentType: 'Homeowner',
                lease: { startDate: '2000-01-01', endDate: '2099-01-01', rent: 0, paymentStatus: 'Pending' },
                propertyId: '', unitName: '', agent: 'Susan', status: 'active', securityDeposit: 0, waterDeposit: 0, accountBalance: 0, dueBalance: 0
            };
    
            const asOfDate = new Date(2024, 2, 15); // March 15, 2024
            
            // Act: Generate ledger with dummy tenant and no payments
            const { ledger, finalDueBalance } = generateLedger(dummyTenant, [], [mockProperty], [], mockOwner, asOfDate, { includeWater: false, includeRent: false, includeServiceCharge: true });
    
            // Assert
            // Handover Jan 1 (day <= 10) -> waive Jan, first bill is Feb.
            // As of March 15, should be billed for Feb and March.
            expect(ledger.length).toBe(2);
            expect(finalDueBalance).toBe(6000); // 2 * 3000
    
            const febCharge = ledger.find(l => l.forMonth === 'Feb 2024');
            const marCharge = ledger.find(l => l.forMonth === 'Mar 2024');
    
            expect(febCharge).toBeDefined();
            expect(febCharge?.charge).toBe(3000);
            expect(marCharge).toBeDefined();
            expect(marCharge?.charge).toBe(3000);
        });
    });

    describe('validatePayment', () => {
        const mockTenant = createMockTenant({ lease: { startDate: '2024-01-01' } });
        const paymentDate = new Date('2024-02-01');
    
        it('should not throw for a valid payment', () => {
            expect(() => validatePayment(1000, paymentDate, mockTenant, 'Rent')).not.toThrow();
        });
    
        it('should throw if payment amount is zero for non-adjustment type', () => {
            expect(() => validatePayment(0, paymentDate, mockTenant, 'Rent')).toThrow('Invalid payment amount: Ksh 0. Amount must be positive.');
        });
        
        it('should throw if adjustment amount is zero', () => {
            expect(() => validatePayment(0, paymentDate, mockTenant, 'Adjustment')).toThrow('Adjustment amount cannot be zero.');
        });
    
        it('should throw if payment date is in the future', () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);
            expect(() => validatePayment(1000, futureDate, mockTenant, 'Rent')).toThrow('Invalid payment date');
        });
    
        it('should throw if payment date is before lease start date', () => {
            const earlyDate = new Date('2023-12-31');
            expect(() => validatePayment(1000, earlyDate, mockTenant, 'Rent')).toThrow('Invalid payment date');
        });
    
        it('should not throw for a valid adjustment', () => {
             expect(() => validatePayment(-500, paymentDate, mockTenant, 'Adjustment')).not.toThrow();
             expect(() => validatePayment(500, paymentDate, mockTenant, 'Adjustment')).not.toThrow();
        });
    });

});
