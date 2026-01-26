
import { calculateTargetDue, getRecommendedPaymentStatus, processPayment, reconcileMonthlyBilling } from './financial-logic';
import { Tenant } from './types';
import { format } from 'date-fns';

describe('Financial Logic Functions', () => {

    const createMockTenant = (overrides: Partial<Tenant> & { lease?: Partial<Tenant['lease']> } = {}): Tenant => {
        const defaultTenant: Tenant = {
            id: 'tenant-1',
            name: 'John Doe',
            email: 'john.doe@example.com',
            phone: '1234567890',
            idNumber: '12345',
            propertyId: 'prop-1',
            unitName: 'A1',
            agent: 'Susan',
            status: 'active',
            securityDeposit: 20000,
            waterDeposit: 5000,
            residentType: 'Tenant',
            lease: {
                startDate: '2023-01-01',
                endDate: '2024-01-01',
                rent: 20000,
                paymentStatus: 'Pending',
                lastBilledPeriod: format(new Date(), 'yyyy-MM'),
            },
            accountBalance: 0,
            dueBalance: 20000,
        };

        const mergedLease = { ...defaultTenant.lease, ...overrides.lease };
        return { ...defaultTenant, ...overrides, lease: mergedLease };
    };

    describe('calculateTargetDue', () => {
        it('should return the monthly rent for a standard tenant', () => {
            const tenant = createMockTenant({ lease: { rent: 25000 }});
            expect(calculateTargetDue(tenant)).toBe(25000);
        });

        it('should return 0 if lease or rent is missing', () => {
            const tenantWithoutLease = createMockTenant();
            delete (tenantWithoutLease as any).lease;
            expect(calculateTargetDue(tenantWithoutLease)).toBe(0);

            const tenantWithoutRent = createMockTenant({ lease: { rent: undefined as any }});
            expect(calculateTargetDue(tenantWithoutRent)).toBe(0);
        });
    });

    describe('processPayment', () => {
        it('should correctly process a full payment that clears the due balance', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 0 });
            const updates = processPayment(tenant, 20000);
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(0);
            expect(updates['lease.paymentStatus']).toBe('Paid');
            expect(updates['lease.lastPaymentDate']).toBe(format(new Date(), 'yyyy-MM-dd'));
        });

        it('should handle overpayment correctly, adding the excess to accountBalance', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 0 });
            const updates = processPayment(tenant, 25000);
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(5000);
            expect(updates['lease.paymentStatus']).toBe('Paid');
        });

        it('should handle partial payment correctly, reducing the dueBalance', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 0 });
            const updates = processPayment(tenant, 15000);
            expect(updates.dueBalance).toBe(5000);
            expect(updates.accountBalance).toBe(0);
            expect(updates['lease.paymentStatus']).toBe('Pending');
        });

        it('should use existing account balance to help cover a payment', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 5000 });
            const updates = processPayment(tenant, 15000);
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(0);
            expect(updates['lease.paymentStatus']).toBe('Paid');
        });

        it('should use existing account balance and a new overpayment', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 5000 });
            const updates = processPayment(tenant, 20000);
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(5000);
            expect(updates['lease.paymentStatus']).toBe('Paid');
        });
    });

    describe('reconcileMonthlyBilling', () => {
        const march1st = new Date('2023-03-01');
        const march10th = new Date('2023-03-10');

        it('should add monthly rent to dueBalance if a new billing period has started', () => {
            const tenant = createMockTenant({
                dueBalance: 0,
                lease: { lastBilledPeriod: '2023-02', rent: 20000 }
            });
            const updates = reconcileMonthlyBilling(tenant, march1st);
            expect(updates.dueBalance).toBe(20000);
            expect(updates['lease.paymentStatus']).toBe('Pending');
            expect(updates['lease.lastBilledPeriod']).toBe('2023-03');
        });

        it('should not bill again if already billed for the current period', () => {
            const tenant = createMockTenant({
                dueBalance: 20000,
                lease: { lastBilledPeriod: '2023-03' }
            });
            const updates = reconcileMonthlyBilling(tenant, march10th);
            expect(updates.dueBalance).toBeUndefined(); // No change to due balance
            expect(updates['lease.paymentStatus']).toBe('Overdue'); // Status should update
        });
        
        it('should apply account balance to the new monthly charge', () => {
            const tenant = createMockTenant({
                dueBalance: 0,
                accountBalance: 5000,
                lease: { lastBilledPeriod: '2023-02', rent: 20000 }
            });
            const updates = reconcileMonthlyBilling(tenant, march1st);
            expect(updates.dueBalance).toBe(15000); // 20000 (rent) - 5000 (credit)
            expect(updates.accountBalance).toBe(0);
            expect(updates['lease.paymentStatus']).toBe('Pending');
        });

        it('should handle account balance that fully covers the new rent', () => {
            const tenant = createMockTenant({
                dueBalance: 0,
                accountBalance: 25000,
                lease: { lastBilledPeriod: '2023-02', rent: 20000 }
            });
            const updates = reconcileMonthlyBilling(tenant, march1st);
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(5000);
            expect(updates['lease.paymentStatus']).toBe('Paid');
        });
    });
    
     describe('getRecommendedPaymentStatus', () => {
        it('should return "Paid" if dueBalance is zero or less', () => {
            const tenantPaid = createMockTenant({ dueBalance: 0 });
            expect(getRecommendedPaymentStatus(tenantPaid)).toBe('Paid');

            const tenantWithCredit = createMockTenant({ dueBalance: -100 });
            expect(getRecommendedPaymentStatus(tenantWithCredit)).toBe('Paid');
        });

        it('should return "Pending" if it is on or before the 5th of the month and balance is due', () => {
            const tenant = createMockTenant({ dueBalance: 1000 });
            const date = new Date('2023-03-05');
            expect(getRecommendedPaymentStatus(tenant, date)).toBe('Pending');
        });
        
        it('should return "Overdue" if it is after the 5th of the month and balance is due', () => {
            const tenant = createMockTenant({ dueBalance: 1000 });
            const date = new Date('2023-03-06');
            expect(getRecommendedPaymentStatus(tenant, date)).toBe('Overdue');
        });
    });
});
