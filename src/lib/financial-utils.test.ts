import { calculateTransactionBreakdown, aggregateFinancials, generateLandlordDisplayTransactions } from './financial-utils';
import { Tenant, Unit, Payment, Property, Lease } from './types';
import { parseISO } from 'date-fns';

// Helper to create mock data with simplified inputs
const createMockTenant = (overrides: Partial<Tenant> & { lease?: Partial<Lease> } = {}): Tenant => {
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
    date: '2023-01-05',
    type: 'Rent',
    status: 'Paid',
    createdAt: new Date().toISOString(),
    paymentMethod: 'M-Pesa',
    transactionId: 'TEST12345',
    ...overrides,
});


describe('Financial Utils Logic', () => {

    describe('calculateTransactionBreakdown', () => {
        it('should calculate 50% commission for an initial letting of a "Rented for Clients" unit', () => {
            const unit = createMockUnit({
                managementStatus: 'Rented for Clients',
                rentAmount: 50000,
                serviceCharge: 6000,
                handoverDate: '2023-07-15' // Recently handed over
            });
            const tenant = createMockTenant({
                lease: { startDate: '2023-08-01', rent: 50000, endDate: '2024-08-01', paymentStatus: 'Paid' }
            });
            const payment = createMockPayment({
                amount: 50000,
                rentForMonth: '2023-08' // First month
            });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);
            expect(breakdown.managementFee).toBe(25000); // 50%
            expect(breakdown.serviceChargeDeduction).toBe(0); // Waived
            expect(breakdown.otherCosts).toBe(1000); // Transaction cost
            expect(breakdown.netToLandlord).toBe(24000); // 50000 - 25000 - 0 - 1000
        });

        it('should calculate 5% commission for a subsequent letting of a "Rented for Clients" unit', () => {
            const unit = createMockUnit({
                managementStatus: 'Rented for Clients',
                rentAmount: 50000,
                serviceCharge: 6000,
                handoverDate: '2022-01-01' // Handed over long ago
            });
            const tenant = createMockTenant({
                lease: { startDate: '2023-08-01', rent: 50000, endDate: '2024-08-01', paymentStatus: 'Paid' } // New tenant, but not initial letting
            });
            const payment = createMockPayment({
                amount: 50000,
                rentForMonth: '2023-08' // First month for THIS tenant
            });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);
            expect(breakdown.managementFee).toBe(2500); // 5%
            expect(breakdown.serviceChargeDeduction).toBe(6000); // Not waived
            expect(breakdown.otherCosts).toBe(1000);
            expect(breakdown.netToLandlord).toBe(40500); // 50000 - 6000 - 2500 - 1000
        });
    });

    describe('generateLandlordDisplayTransactions', () => {
        const mockUnitSM = createMockUnit({ name: 'A1', ownership: 'SM', rentAmount: 25000, serviceCharge: 0 });
        const mockProperties: Property[] = [
            createMockProperty('prop-1', [mockUnitSM])
        ];

        it('should correctly break down a lump-sum payment and exclude deposits', () => {
            const tenant = createMockTenant({
                id: 't-lump',
                unitName: 'A1',
                propertyId: 'prop-1',
                lease: { startDate: '2023-10-01', rent: 25000, endDate: '2024-10-01', paymentStatus: 'Paid' },
                securityDeposit: 25000,
                waterDeposit: 5000,
            });

            // This single payment covers deposits + 4 months rent
            const payment = createMockPayment({
                tenantId: 't-lump',
                amount: 130000,
                date: '2023-10-02'
            });

            const transactions = generateLandlordDisplayTransactions([payment], [tenant], mockProperties, undefined, undefined, 'soil_merchants_internal');

            // Assertions
            expect(transactions).toHaveLength(4); // Should unroll into 4 rent transactions

            // Check October (first month)
            expect(transactions[0].forMonth).toBe('Oct 2023');
            expect(transactions[0].gross).toBe(25000);
            expect(transactions[0].managementFee).toBe(1250); // 5% of 25k
            expect(transactions[0].otherCosts).toBe(1000);
            expect(transactions[0].netToLandlord).toBe(22750); // 25000 - 1250 - 1000

            // Check January (last month)
            expect(transactions[3].forMonth).toBe('Jan 2024');
            expect(transactions[3].gross).toBe(25000);

            const totalGross = transactions.reduce((sum, t) => sum + t.gross, 0);
            expect(totalGross).toBe(100000); // Should only be the rent portion
        });
        
        it('should anchor the breakdown to the lease start date', () => {
             const tenant = createMockTenant({
                id: 't-anchor',
                unitName: 'A1',
                propertyId: 'prop-1',
                lease: { startDate: '2023-07-15', rent: 25000, endDate: '2024-07-15', paymentStatus: 'Paid' },
                securityDeposit: 0, waterDeposit: 0,
            });
            
            const payment = createMockPayment({ tenantId: 't-anchor', amount: 50000, date: '2023-07-16' });

            const transactions = generateLandlordDisplayTransactions([payment], [tenant], mockProperties, undefined, undefined, 'soil_merchants_internal');
            
            expect(transactions).toHaveLength(2);
            expect(transactions[0].forMonth).toBe('Jul 2023');
            expect(transactions[1].forMonth).toBe('Aug 2023');
        });

        it('should apply otherCosts once per month for multi-unit landlords', () => {
            const landlordId = 'multi-unit-lord';
            const units = [
                createMockUnit({ name: 'A1', landlordId, rentAmount: 20000 }),
                createMockUnit({ name: 'A2', landlordId, rentAmount: 30000 }),
            ];
            const props = [createMockProperty('prop-multi', units)];
            const tenants = [
                createMockTenant({ id: 't-A1', unitName: 'A1', propertyId: 'prop-multi', lease: { rent: 20000 } }),
                createMockTenant({ id: 't-A2', unitName: 'A2', propertyId: 'prop-multi', lease: { rent: 30000 } }),
            ];
            const payments = [
                createMockPayment({ tenantId: 't-A1', amount: 20000, date: '2024-01-05', rentForMonth: '2024-01'}),
                createMockPayment({ tenantId: 't-A2', amount: 30000, date: '2024-01-06', rentForMonth: '2024-01'}),
            ];

            const transactions = generateLandlordDisplayTransactions(payments, tenants, props, undefined, undefined, landlordId);
            
            expect(transactions.length).toBe(2);
            const janTransactions = transactions.filter(t => t.forMonth === 'Jan 2024');
            
            const costs = janTransactions.map(t => t.otherCosts);
            expect(costs).toContain(1000);
            expect(costs).toContain(0);
            
            const totalCosts = costs.reduce((a, b) => a + b, 0);
            expect(totalCosts).toBe(1000);
        });

        it('should apply otherCosts per transaction for single-unit landlords', () => {
            const landlordId = 'single-unit-lord';
            const units = [createMockUnit({ name: 'B1', landlordId, rentAmount: 40000 })];
            const props = [createMockProperty('prop-single', units)];
            const tenant = createMockTenant({ id: 't-B1', unitName: 'B1', propertyId: 'prop-single', lease: { rent: 40000 } });
            
            // Simulating two separate payments for the same month's rent
            const payments = [
                createMockPayment({ tenantId: 't-B1', amount: 40000, date: '2024-01-05', rentForMonth: '2024-01'}),
                createMockPayment({ tenantId: 't-B1', amount: 40000, date: '2024-02-05', rentForMonth: '2024-02'}),
            ];

            const transactions = generateLandlordDisplayTransactions(payments, [tenant], props, undefined, undefined, landlordId);
            
            expect(transactions.length).toBe(2);
            expect(transactions[0].otherCosts).toBe(1000);
            expect(transactions[1].otherCosts).toBe(1000);
        });
    });
});