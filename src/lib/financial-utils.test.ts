
import { calculateTransactionBreakdown, aggregateFinancials, generateLandlordDisplayTransactions } from './financial-utils';
import { Tenant, Unit, Payment, Property, Lease, Landlord } from './types';
import { parseISO, format } from 'date-fns';

const createMockTenant = (overrides: Partial<Tenant> & { lease?: Partial<Lease> } = {}): Tenant => {
    const defaultLease: Lease = {
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        rent: 20000,
        paymentStatus: 'Paid',
        lastBilledPeriod: '2026-12',
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

    const { lease: leaseOverrides, ...tenantOverrides } = overrides;

    return {
        ...defaultTenant,
        ...tenantOverrides,
        lease: {
            ...defaultLease,
            ...leaseOverrides,
        },
    };
};

const createMockUnit = (overrides: Partial<Unit> = {}): Unit => ({
    name: 'Test Unit',
    status: 'rented',
    ownership: 'Landlord',
    unitType: 'One Bedroom',
    rentAmount: 20000,
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

const createMockPayment = (overrides: Partial<Payment> = {}): Payment => ({
    id: 'test-payment',
    tenantId: 'test-tenant',
    amount: 20000,
    date: '2026-01-05',
    type: 'Rent',
    status: 'Paid',
    createdAt: new Date().toISOString(),
    paymentMethod: 'M-Pesa',
    transactionId: 'TEST12345',
    ...overrides,
});

describe('Financial Utils Logic', () => {

    describe('Handover and Consolidation Rules', () => {
        it('should waive service charge for the month of handover (Dec handover -> Dec SC 0)', () => {
            const unit = createMockUnit({
                handoverDate: '2025-12-15',
                serviceCharge: 3000
            });
            const tenant = createMockTenant({
                lease: { startDate: '2025-12-15', rent: 20000 }
            });
            const payment = createMockPayment({
                amount: 20000,
                rentForMonth: '2025-12'
            });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);
            expect(breakdown.serviceChargeDeduction).toBe(0);
        });

        it('should sum service charges for rented and vacant units in the first transaction of the month', () => {
            const landlordId = 'multi-unit-lord';
            const landlord = { id: landlordId, name: 'Landlord' } as Landlord;
            
            // Unit A is rented (SC 3000), Unit B is vacant (SC 4000)
            const units = [
                createMockUnit({ name: 'A', landlordId, serviceCharge: 3000, handoverDate: '2025-11-01', handoverStatus: 'Handed Over' }),
                createMockUnit({ name: 'B', landlordId, serviceCharge: 4000, handoverDate: '2025-11-01', handoverStatus: 'Handed Over', status: 'vacant' }),
            ];
            const props = [createMockProperty('p1', units)];
            
            const tenantA = createMockTenant({ 
                id: 'tA', unitName: 'A', propertyId: 'p1', 
                lease: { startDate: '2026-01-01', rent: 20000 } 
            });
            
            const payments = [
                createMockPayment({ tenantId: 'tA', amount: 20000, date: '2026-01-05', rentForMonth: '2026-01' })
            ];

            const transactions = generateLandlordDisplayTransactions(payments, [tenantA], props, landlord);
            
            // Should have 1 transaction for Jan
            expect(transactions).toHaveLength(1);
            // S.Charge should be 3000 (occupied) + 4000 (vacant) = 7000
            expect(transactions[0].serviceChargeDeduction).toBe(7000);
            expect(transactions[0].vacantServiceCharge).toBe(4000);
            // Net = 20000 - 7000 - 1000 (mgmt fee) - 0 (no otherCosts yet as it's the start month)
            // Wait, otherCosts policy is Feb 2026.
            expect(transactions[0].netToLandlord).toBe(12000); // 20000 - 7000 - 1000
        });

        it('should inject a row for months with only vacant units and no rental income', () => {
            const landlordId = 'vacant-lord';
            const landlord = { id: landlordId, name: 'Landlord' } as Landlord;
            const units = [
                createMockUnit({ name: 'V1', landlordId, serviceCharge: 4000, handoverDate: '2025-11-01', handoverStatus: 'Handed Over', status: 'vacant' })
            ];
            const props = [createMockProperty('p1', units)];
            
            const startDate = parseISO('2026-01-01');
            const endDate = parseISO('2026-01-31');

            const transactions = generateLandlordDisplayTransactions([], [], props, landlord, startDate, endDate);
            
            expect(transactions).toHaveLength(1);
            expect(transactions[0].unitName).toBe('Vacant Units');
            expect(transactions[0].gross).toBe(0);
            expect(transactions[0].serviceChargeDeduction).toBe(4000);
            expect(transactions[0].netToLandlord).toBe(-4000);
        });

        it('should strictly exclude transactions outside the report period (no March in Jan-Feb report)', () => {
            const landlordId = 'period-lord';
            const landlord = { id: landlordId, name: 'Landlord' } as Landlord;
            const unit = createMockUnit({ name: 'U1', landlordId, rentAmount: 20000 });
            const props = [createMockProperty('p1', [unit])];
            const tenant = createMockTenant({ id: 't1', unitName: 'U1', propertyId: 'p1', lease: { startDate: '2026-01-01', rent: 20000 } });
            
            // Payment covers 3 months
            const payment = createMockPayment({ tenantId: 't1', amount: 60000, date: '2026-01-05' });

            const startDate = parseISO('2026-01-01');
            const endDate = parseISO('2026-02-28');

            const transactions = generateLandlordDisplayTransactions([payment], [tenant], props, landlord, startDate, endDate);
            
            const months = transactions.map(t => t.rentForMonth);
            expect(months).toContain('2026-01');
            expect(months).toContain('2026-02');
            expect(months).not.toContain('2026-03');
            expect(transactions).toHaveLength(2);
        });
    });

    describe('Other Costs Policy (Feb 2026)', () => {
        it('should apply KSh 1,000 transaction fee from Feb 2026 onwards', () => {
            const unit = createMockUnit({ name: 'U1', rentAmount: 20000 });
            const props = [createMockProperty('p1', [unit])];
            const tenant = createMockTenant({ id: 't1', unitName: 'U1', propertyId: 'p1', lease: { startDate: '2026-02-01', rent: 20000 } });
            const payment = createMockPayment({ tenantId: 't1', amount: 20000, date: '2026-02-05', rentForMonth: '2026-02' });

            const transactions = generateLandlordDisplayTransactions([payment], [tenant], props, null);
            
            expect(transactions[0].otherCosts).toBe(1000);
        });

        it('should not apply transaction fee before Feb 2026', () => {
            const unit = createMockUnit({ name: 'U1', rentAmount: 20000 });
            const props = [createMockProperty('p1', [unit])];
            const tenant = createMockTenant({ id: 't1', unitName: 'U1', propertyId: 'p1', lease: { startDate: '2026-01-01', rent: 20000 } });
            const payment = createMockPayment({ tenantId: 't1', amount: 20000, date: '2026-01-05', rentForMonth: '2026-01' });

            const transactions = generateLandlordDisplayTransactions([payment], [tenant], props, null);
            
            expect(transactions[0].otherCosts).toBe(0);
        });
    });
});
