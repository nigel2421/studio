import { calculateTransactionBreakdown, aggregateFinancials, generateLandlordDisplayTransactions } from './financial-utils';
import { Tenant, Unit, Payment, Property, Lease, Landlord } from './types';
import { parseISO, format } from 'date-fns';

const createMockTenant = (overrides: Omit<Partial<Tenant>, 'lease'> & { lease?: Partial<Lease> } = {}): Tenant => {
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
    } as Tenant;
};

const createMockUnit = (name: string, overrides: Partial<Unit> = {}): Unit => ({
    name,
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
        it('should waive service charge for the month of handover', () => {
            const unit = createMockUnit('U1', {
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

        it('should sum service charges for rented and vacant units in the same month', () => {
            const landlordId = 'multi-unit-lord';
            const landlord = { id: landlordId, name: 'Landlord' } as Landlord;
            
            const units = [
                createMockUnit('A', { landlordId, serviceCharge: 3000, handoverDate: '2025-11-01', handoverStatus: 'Handed Over' }),
                createMockUnit('B', { landlordId, serviceCharge: 4000, handoverDate: '2025-11-01', handoverStatus: 'Handed Over', status: 'vacant' }),
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
            
            expect(transactions).toHaveLength(1);
            // S.Charge should be 3000 (occupied) + 4000 (vacant) = 7000
            expect(transactions[0].serviceChargeDeduction).toBe(7000);
            expect(transactions[0].netToLandlord).toBe(20000 - 7000 - 1000); // 12000
        });
    });

    describe('Fee and Historical Logic', () => {
        it('should capture historical rent months if paid within the report period', () => {
            const landlordId = 'hist-lord';
            const landlord = { id: landlordId, name: 'Landlord' } as Landlord;
            const unit = createMockUnit('U1', { landlordId, rentAmount: 20000 });
            const props = [createMockProperty('p1', [unit])];
            const tenant = createMockTenant({ 
                id: 't1', unitName: 'U1', propertyId: 'p1', 
                lease: { startDate: '2025-10-01', rent: 20000 } 
            });
            
            // Payment made in Jan 2026 covering Oct 2025
            const payment = createMockPayment({ 
                tenantId: 't1', amount: 20000, date: '2026-01-10', rentForMonth: '2025-10' 
            });

            const startDate = parseISO('2026-01-01');
            const endDate = parseISO('2026-01-31');

            const transactions = generateLandlordDisplayTransactions([payment], [tenant], props, landlord, startDate, endDate);
            
            expect(transactions.some(t => t.rentForMonth === '2025-10')).toBe(true);
        });

        it('should apply otherCosts only if income is present (gross > 0)', () => {
            const landlordId = 'fee-lord';
            const landlord = { id: landlordId, name: 'Landlord' } as Landlord;
            const units = [
                createMockUnit('V1', { landlordId, serviceCharge: 4000, handoverDate: '2025-11-01', handoverStatus: 'Handed Over', status: 'vacant' })
            ];
            const props = [createMockProperty('p1', units)];
            
            const startDate = parseISO('2026-02-01');
            const endDate = parseISO('2026-02-28');

            const transactions = generateLandlordDisplayTransactions([], [], props, landlord, startDate, endDate);
            
            expect(transactions).toHaveLength(1);
            expect(transactions[0].gross).toBe(0);
            expect(transactions[0].otherCosts).toBe(0); // Should be zero for vacant rows
            expect(transactions[0].netToLandlord).toBe(-4000);
        });
    });
});