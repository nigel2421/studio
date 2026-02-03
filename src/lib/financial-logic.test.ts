import { generateLedger, reconcileMonthlyBilling } from './financial-logic';
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
            const tenant = createMockTenant({ lease: { startDate: '2024-01-01', rent: 25000 } });
            const payments = [
                createMockPayment({ amount: 25000, date: '2024-02-04' }), // Feb payment
                createMockPayment({ amount: 25000, date: '2024-01-05' }), // Jan payment
            ];
            const { ledger } = generateLedger(tenant, payments, [mockProperty]);

            // Check order
            const janPaymentIndex = ledger.findIndex(l => l.description.includes('Payment Received') && new Date(l.date).getMonth() === 0);
            const febPaymentIndex = ledger.findIndex(l => l.description.includes('Payment Received') && new Date(l.date).getMonth() === 1);
            
            expect(janPaymentIndex).toBeLessThan(febPaymentIndex);
        });

        it('should correctly break down an initial lump-sum payment', () => {
            const tenant = createMockTenant({ 
                lease: { startDate: '2023-10-01', rent: 25000 },
                securityDeposit: 25000,
                waterDeposit: 5000,
                dueBalance: 0,
            });
            const payment = createMockPayment({
                amount: 130000,
                date: '2023-10-02',
            });
            
            const { ledger, finalDueBalance } = generateLedger(tenant, [payment], [mockProperty]);
            
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

});
