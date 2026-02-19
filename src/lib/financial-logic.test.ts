import { generateLedger, reconcileMonthlyBilling, processPayment, getRecommendedPaymentStatus } from './financial-logic';
import { Tenant, Unit, Payment, Property, Lease } from './types';
import { parseISO, format } from 'date-fns';

const createMockTenant = (overrides: Omit<Partial<Tenant>, 'lease'> & { lease?: Partial<Lease> } = {}): Tenant => {
    const defaultLease: Lease = {
        startDate: '2026-01-01',
        endDate: '2027-01-01',
        rent: 20000,
        paymentStatus: 'Paid',
        lastBilledPeriod: '2026-01',
    };

    const defaultTenant: Omit<Tenant, 'lease'> = {
        id: 'test-tenant',
        name: 'Test Tenant',
        email: 'test@tenant.com',
        phone: '123',
        idNumber: '123',
        propertyId: 'prop-1',
        unitName: 'A1',
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

describe('Financial Logic', () => {

    describe('Water Deposit Logic', () => {
        it('should correctly include Water Deposit in the ledger and balance', () => {
            const tenant = createMockTenant({
                waterDeposit: 5000,
                lease: { startDate: '2026-01-01', rent: 20000 }
            });
            
            // Payment for water deposit
            const payments: Payment[] = [{
                id: 'p1',
                tenantId: 'test-tenant',
                amount: 5000,
                date: '2026-01-02',
                type: 'WaterDeposit',
                status: 'Paid',
                createdAt: new Date().toISOString(),
                paymentMethod: 'M-Pesa',
                transactionId: 'TRANS1'
            }];

            const { ledger, finalDueBalance } = generateLedger(tenant, payments, [], [], null, new Date('2026-01-31'));
            
            // Should have: Rent Charge (20k), Water Deposit Charge (5k), Water Deposit Payment (5k)
            // Final balance should be 20k (unpaid rent)
            expect(finalDueBalance).toBe(20000);
            expect(ledger.some(l => l.description === 'Water Deposit')).toBe(true);
            expect(ledger.some(l => l.description.includes('Water Deposit') && l.payment === 5000)).toBe(true);
        });
    });

    describe('getRecommendedPaymentStatus', () => {
        it('should return Paid if balance is zero or less', () => {
            expect(getRecommendedPaymentStatus({ dueBalance: 0 })).toBe('Paid');
            expect(getRecommendedPaymentStatus({ dueBalance: -500 })).toBe('Paid');
        });

        it('should return Pending if balance is positive and date is on or before 5th', () => {
            const jan5 = parseISO('2026-01-05');
            expect(getRecommendedPaymentStatus({ dueBalance: 1000 }, jan5)).toBe('Pending');
        });

        it('should return Overdue if balance is positive and date is after 5th', () => {
            const jan6 = parseISO('2026-01-06');
            expect(getRecommendedPaymentStatus({ dueBalance: 1000 }, jan6)).toBe('Overdue');
        });
    });

    describe('generateLedger filtering', () => {
        it('should exclude water charges when includeWater is false', () => {
            const tenant = createMockTenant();
            const waterReadings = [{ id: 'w1', amount: 1500, date: '2026-01-15', tenantId: 'test-tenant', unitName: 'A1' } as any];
            const { ledger } = generateLedger(tenant, [], [], waterReadings, null, new Date(), { includeWater: false });
            expect(ledger.some(l => l.description.includes('Water Bill'))).toBe(false);
        });

        it('should include only water items when includeRent and includeServiceCharge are false', () => {
            const tenant = createMockTenant();
            const payments = [{ id: 'p1', amount: 1500, type: 'WaterDeposit', date: '2026-01-16', tenantId: 'test-tenant', status: 'Paid' } as any];
            const waterReadings = [{ id: 'w1', amount: 1500, date: '2026-01-15', unitName: 'A1', tenantId: 'test-tenant' } as any];
            
            const { ledger } = generateLedger(tenant, payments, [], waterReadings, null, new Date(), { 
                includeRent: false, 
                includeServiceCharge: false, 
                includeWater: true 
            });
            
            expect(ledger.every(l => l.description.includes('Water') || l.description.includes('Payment'))).toBe(true);
            expect(ledger.some(l => l.description.includes('Rent'))).toBe(false);
        });
    });
});