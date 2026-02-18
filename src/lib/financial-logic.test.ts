
import { generateLedger, reconcileMonthlyBilling, validatePayment, getRecommendedPaymentStatus } from './financial-logic';
import { Tenant, Unit, Payment, Property, Lease } from './types';
import { parseISO, format } from 'date-fns';

const createMockTenant = (overrides: Partial<Tenant> & { lease?: Partial<Lease> } = {}): Tenant => {
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
    };
};

describe('Financial Logic', () => {

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
            const waterReadings = [{ id: 'w1', amount: 1500, date: '2026-01-15' } as any];
            const { ledger } = generateLedger(tenant, [], [], waterReadings, null, new Date(), { includeWater: false });
            expect(ledger.some(l => l.description.includes('Water Bill'))).toBe(false);
        });

        it('should include only water items when includeRent and includeServiceCharge are false', () => {
            const tenant = createMockTenant();
            const payments = [{ id: 'p1', amount: 1500, type: 'Water', date: '2026-01-16' } as any];
            const waterReadings = [{ id: 'w1', amount: 1500, date: '2026-01-15', unitName: 'A1' } as any];
            
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
