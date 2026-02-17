

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
            expect(breakdown.netToLandlord).toBe(25000); // 50000 - 25000
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
            expect(breakdown.netToLandlord).toBe(41500); // 50000 - 6000 - 2500
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

            const payment = createMockPayment({
                tenantId: 't-lump',
                amount: 130000,
                date: '2023-10-02'
            });

            const transactions = generateLandlordDisplayTransactions([payment], [tenant], mockProperties, null);

            expect(transactions).toHaveLength(4);

            expect(transactions[0].forMonthDisplay).toBe('Oct 2023');
            expect(transactions[0].gross).toBe(25000);
            expect(transactions[0].managementFee).toBe(1250);
            expect(transactions[0].otherCosts).toBe(1000);
            expect(transactions[0].netToLandlord).toBe(22750);

            expect(transactions[3].forMonthDisplay).toBe('Jan 2024');
            expect(transactions[3].otherCosts).toBe(0); // Jan rule applies

            const totalGross = transactions.reduce((sum, t) => sum + t.gross, 0);
            expect(totalGross).toBe(100000);
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

            const transactions = generateLandlordDisplayTransactions([payment], [tenant], mockProperties, null);
            
            expect(transactions).toHaveLength(2);
            expect(transactions[0].forMonthDisplay).toBe('Jul 2023');
            expect(transactions[1].forMonthDisplay).toBe('Aug 2023');
        });

        it('should apply otherCosts once per month for multi-unit landlords', () => {
            const landlordId = 'multi-unit-lord';
            const landlord = { id: landlordId, name: 'Multi Unit Lord', email: '', phone: '' };
            const units = [
                createMockUnit({ name: 'A1', landlordId, rentAmount: 20000 }),
                createMockUnit({ name: 'A2', landlordId, rentAmount: 30000 }),
            ];
            const props = [createMockProperty('prop-multi', units)];
            const tenants = [
                createMockTenant({ id: 't-A1', unitName: 'A1', propertyId: 'prop-multi', lease: { startDate: '2024-02-01', rent: 20000, endDate: '2025-02-01', paymentStatus: 'Paid' } }),
                createMockTenant({ id: 't-A2', unitName: 'A2', propertyId: 'prop-multi', lease: { startDate: '2024-02-01', rent: 30000, endDate: '2025-02-01', paymentStatus: 'Paid' } }),
            ];
            const payments = [
                createMockPayment({ tenantId: 't-A1', amount: 20000, date: '2024-02-05', rentForMonth: '2024-02'}),
                createMockPayment({ tenantId: 't-A2', amount: 30000, date: '2024-02-06', rentForMonth: '2024-02'}),
            ];

            const transactions = generateLandlordDisplayTransactions(payments, tenants, props, landlord);
            
            expect(transactions.length).toBe(2);
            const febTransactions = transactions.filter(t => t.forMonthDisplay === 'Feb 2024');
            
            const costs = febTransactions.map(t => t.otherCosts);
            expect(costs).toContain(1000);
            expect(costs).toContain(0);
            
            const totalCosts = costs.reduce((a, b) => a + b, 0);
            expect(totalCosts).toBe(1000);
        });

        it('should apply otherCosts per transaction for single-unit landlords', () => {
            const landlordId = 'single-unit-lord';
            const landlord = { id: landlordId, name: 'Single Unit Lord', email: '', phone: '' };
            const units = [createMockUnit({ name: 'B1', landlordId, rentAmount: 40000 })];
            const props = [createMockProperty('prop-single', units)];
            const tenant = createMockTenant({ id: 't-B1', unitName: 'B1', propertyId: 'prop-single', lease: { startDate: '2024-02-01', rent: 40000, endDate: '2025-02-01', paymentStatus: 'Paid' } });
            
            const payments = [
                createMockPayment({ tenantId: 't-B1', amount: 40000, date: '2024-02-05', rentForMonth: '2024-02'}),
                createMockPayment({ tenantId: 't-B1', amount: 40000, date: '2024-03-05', rentForMonth: '2024-03'}),
            ];

            const transactions = generateLandlordDisplayTransactions(payments, [tenant], props, landlord);
            
            expect(transactions.length).toBe(2);
            expect(transactions[0].otherCosts).toBe(1000);
            expect(transactions[1].otherCosts).toBe(1000);
        });

        it('should apply special deductions per unit once', () => {
            const landlord = { id: 'special-lord', name: 'Special Lord', email: '', phone: '', deductStageTwoCost: true, deductStageThreeCost: true };
            const units = [
                createMockUnit({ name: 'S1', unitType: 'Studio', landlordId: landlord.id }),
                createMockUnit({ name: 'S2', unitType: 'One Bedroom', landlordId: landlord.id }),
            ];
            const props = [createMockProperty('prop-special', units)];
            const tenants = [
                createMockTenant({ id: 't-S1', unitName: 'S1', propertyId: 'prop-special', lease: { rent: 20000, startDate: '2024-01-01', endDate: '2025-01-01', paymentStatus: 'Paid' } }),
                createMockTenant({ id: 't-S2', unitName: 'S2', propertyId: 'prop-special', lease: { rent: 30000, startDate: '2024-01-01', endDate: '2025-01-01', paymentStatus: 'Paid' } }),
            ];
            const payments = [
                createMockPayment({ tenantId: 't-S1', amount: 20000, date: '2024-01-05', rentForMonth: '2024-01' }),
                createMockPayment({ tenantId: 't-S2', amount: 30000, date: '2024-01-06', rentForMonth: '2024-01' }),
                createMockPayment({ tenantId: 't-S1', amount: 20000, date: '2024-02-05', rentForMonth: '2024-02' }),
            ];
            
            const transactions = generateLandlordDisplayTransactions(payments, tenants, props, landlord);
            
            const t1 = transactions.find(t => t.unitName === 'S1' && t.rentForMonth === '2024-01');
            const t2 = transactions.find(t => t.unitName === 'S2' && t.rentForMonth === '2024-01');
            const t3 = transactions.find(t => t.unitName === 'S1' && t.rentForMonth === '2024-02');
            
            // t1 should have Stage 2 (10000) + Stage 3 Studio (8000) = 18000
            expect(t1!.specialDeductions).toBe(18000);
            // t2 should have Stage 2 (10000) + Stage 3 1BR (12000) = 22000
            expect(t2!.specialDeductions).toBe(22000);
            // t3 is for a subsequent month for a unit that already had deductions, so it should be 0
            expect(t3!.specialDeductions).toBe(0);

            // Check net payout (Jan costs are waived)
            expect(t1!.netToLandlord).toBe(20000 - (20000 * 0.05) - 0 - 18000);
            expect(t2!.netToLandlord).toBe(30000 - (30000 * 0.05) - 0 - 22000);
        });

    });
});
