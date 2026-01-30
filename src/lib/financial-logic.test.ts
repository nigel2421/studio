import { calculateTargetDue, getRecommendedPaymentStatus, processPayment, reconcileMonthlyBilling, validatePayment, calculateTransactionBreakdown } from './financial-logic';
import { Tenant, Agent, Unit, Payment, UnitStatus, OwnershipType, UnitType, ManagementStatus } from './types';
import { format, startOfMonth } from 'date-fns';

describe('Financial Logic Functions', () => {

    const createMockAgent = (): Agent => 'Susan';

    const createMockTenant = (overrides: Omit<Partial<Tenant>, 'lease'> & { lease?: Partial<Tenant['lease']> } = {}): Tenant => {
        const defaultTenant: Tenant = {
            id: 'tenant-1',
            name: 'John Doe',
            email: 'john.doe@example.com',
            phone: '1234567890',
            idNumber: '12345',
            propertyId: 'prop-1',
            unitName: 'A1',
            agent: createMockAgent(),
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

        const { lease: leaseOverrides, ...otherOverrides } = overrides;
        const mergedLease = { ...defaultTenant.lease, ...leaseOverrides };

        return { ...defaultTenant, ...otherOverrides, lease: mergedLease as Tenant['lease'] };
    };

    const createMockUnit = (overrides: Partial<Unit> = {}): Unit => ({
        name: 'A1',
        status: 'rented' as UnitStatus,
        ownership: 'Landlord' as OwnershipType,
        unitType: 'One Bedroom' as UnitType,
        managementStatus: 'Rented for Clients' as ManagementStatus,
        rentAmount: 30000,
        serviceCharge: 4000,
        ...overrides,
    });

    const createMockPayment = (overrides: Partial<Payment> = {}): Payment => ({
      id: 'payment-1',
      tenantId: 'tenant-1',
      amount: 30000,
      date: '2023-10-10',
      type: 'Rent',
      status: 'Paid',
      rentForMonth: '2023-10',
      createdAt: new Date(),
      ...overrides
    });


    const createMockHomeowner = (overrides: Omit<Partial<Tenant>, 'lease'> & { lease?: Partial<Tenant['lease']> } = {}): Tenant => {
        const defaultLease = {
            rent: 0,
            serviceCharge: 5000,
            startDate: '2023-01-01',
            lastBilledPeriod: '2022-12',
        };

        const mergedLease = { ...defaultLease, ...overrides.lease };

        return createMockTenant({
            residentType: 'Homeowner',
            dueBalance: 0,
            ...overrides,
            lease: mergedLease,
        });
    };

    const createMockUnitWithDefaults = (handoverDate?: string, serviceCharge: number = 5000): Unit => ({
        name: 'A1',
        status: 'vacant',
        ownership: 'Landlord',
        unitType: 'One Bedroom',
        managementStatus: 'Rented for Clients',
        handoverStatus: 'Handed Over',
        handoverDate: handoverDate,
        serviceCharge: serviceCharge,
    });


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
            const paymentDate = new Date();
            const updates = processPayment(tenant, 20000, 'Rent', paymentDate);
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(0);
            expect(updates['lease.paymentStatus']).toBe('Paid');
            expect(updates['lease.lastPaymentDate']).toBe(format(paymentDate, 'yyyy-MM-dd'));
        });

        it('should handle overpayment correctly, adding the excess to accountBalance', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 0 });
            const updates = processPayment(tenant, 25000, 'Rent');
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(5000);
            expect(updates['lease.paymentStatus']).toBe('Paid');
        });

        it('should handle partial payment correctly, reducing the dueBalance', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 0 });
            const paymentDate = new Date('2023-03-04'); // before 5th
            const updates = processPayment(tenant, 15000, 'Rent', paymentDate);
            expect(updates.dueBalance).toBe(5000);
            expect(updates.accountBalance).toBe(0);
            expect(updates['lease.paymentStatus']).toBe('Pending');
        });

        it('should use existing account balance to help cover a payment', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 5000 });
            const updates = processPayment(tenant, 15000, 'Rent');
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(0);
            expect(updates['lease.paymentStatus']).toBe('Paid');
        });

        it('should use existing account balance and a new overpayment', () => {
            const tenant = createMockTenant({ dueBalance: 20000, accountBalance: 5000 });
            const updates = processPayment(tenant, 20000, 'Rent');
            expect(updates.dueBalance).toBe(0);
            expect(updates.accountBalance).toBe(5000);
            expect(updates['lease.paymentStatus']).toBe('Paid');
        });
    });

    describe('reconcileMonthlyBilling', () => {
        const may10th = new Date('2023-05-10');

        describe('For Tenants', () => {
            it('should add monthly rent for one missed month', () => {
                const tenant = createMockTenant({
                    dueBalance: 0,
                    lease: { lastBilledPeriod: '2023-04', rent: 20000 }
                });
                const updates = reconcileMonthlyBilling(tenant, undefined, may10th);
                expect(updates.dueBalance).toBe(20000);
                expect(updates['lease.paymentStatus']).toBe('Overdue');
                expect(updates['lease.lastBilledPeriod']).toBe('2023-05');
            });

            it('should add monthly rent for multiple missed months', () => {
                const tenant = createMockTenant({
                    dueBalance: 1000, // previous arrears
                    lease: { lastBilledPeriod: '2023-02', rent: 20000 }
                });
                // Should bill for Mar, Apr, May (3 months)
                const updates = reconcileMonthlyBilling(tenant, undefined, may10th);
                expect(updates.dueBalance).toBe(1000 + (3 * 20000)); // 61000
                expect(updates['lease.paymentStatus']).toBe('Overdue');
                expect(updates['lease.lastBilledPeriod']).toBe('2023-05');
            });

            it('should not bill again if already billed for the current period', () => {
                const tenant = createMockTenant({
                    dueBalance: 20000,
                    lease: { lastBilledPeriod: '2023-05' }
                });
                const updates = reconcileMonthlyBilling(tenant, undefined, may10th);
                // No change to due balance, just status update
                expect(updates.dueBalance).toBeUndefined();
                expect(updates['lease.paymentStatus']).toBe('Overdue');
                expect(updates['lease.lastBilledPeriod']).toBeUndefined();
            });

            it('should apply account balance to the new monthly charges', () => {
                const tenant = createMockTenant({
                    dueBalance: 0,
                    accountBalance: 5000,
                    lease: { lastBilledPeriod: '2023-04', rent: 20000 }
                });
                const updates = reconcileMonthlyBilling(tenant, undefined, may10th); // Bill for May
                expect(updates.dueBalance).toBe(15000); // 20000 (rent) - 5000 (credit)
                expect(updates.accountBalance).toBe(0);
                expect(updates['lease.paymentStatus']).toBe('Overdue');
            });

            it('should handle account balance that fully covers multiple new rent charges', () => {
                const tenant = createMockTenant({
                    dueBalance: 0,
                    accountBalance: 45000,
                    lease: { lastBilledPeriod: '2023-02', rent: 20000 }
                });
                // Should bill for Mar, Apr, May (3 months * 20k = 60k)
                const updates = reconcileMonthlyBilling(tenant, undefined, may10th);
                expect(updates.dueBalance).toBe(15000); // 60000 - 45000
                expect(updates.accountBalance).toBe(0);
                expect(updates['lease.paymentStatus']).toBe('Overdue');
            });

            it('should return only status update if next billable month is in the future', () => {
                const tenant = createMockTenant({
                    dueBalance: 0,
                    lease: { lastBilledPeriod: '2023-05' }
                });
                const updates = reconcileMonthlyBilling(tenant, undefined, may10th);
                expect(updates).toEqual({ 'lease.paymentStatus': 'Paid' });
            });
        });

        describe('For Homeowners (Service Charge)', () => {
            const may10th = new Date('2023-05-10');

            it('should start billing in the same month if handover is on/before 10th', () => {
                const unit = createMockUnitWithDefaults('2023-03-08'); // Handover March 8th
                const homeowner = createMockHomeowner({ lease: { lastBilledPeriod: '2023-02' }});
                
                // Reconcile on May 10th. Should bill for March, April, May (3 months).
                const updates = reconcileMonthlyBilling(homeowner, unit, may10th);

                expect(updates.dueBalance).toBe(3 * 5000); // 15000
                expect(updates['lease.lastBilledPeriod']).toBe('2023-05');
            });

            it('should start billing in the next month if handover is after 10th', () => {
                const unit = createMockUnitWithDefaults('2023-03-12'); // Handover March 12th
                const homeowner = createMockHomeowner({ lease: { lastBilledPeriod: '2023-03' }});

                // Reconcile on May 10th. Should bill for April, May (2 months).
                const updates = reconcileMonthlyBilling(homeowner, unit, may10th);

                expect(updates.dueBalance).toBe(2 * 5000); // 10000
                expect(updates['lease.lastBilledPeriod']).toBe('2023-05');
            });

            it('should not bill if lastBilledPeriod is already up to date', () => {
                 const unit = createMockUnitWithDefaults('2023-01-05'); 
                 const homeowner = createMockHomeowner({ 
                     dueBalance: 5000,
                     lease: { lastBilledPeriod: '2023-05' }
                 });

                 const updates = reconcileMonthlyBilling(homeowner, unit, may10th);
                 expect(updates.dueBalance).toBeUndefined(); // No new charge
                 expect(updates['lease.paymentStatus']).toBe('Overdue');
                 expect(updates['lease.lastBilledPeriod']).toBeUndefined();
            });
        });
    });
    
     describe('getRecommendedPaymentStatus', () => {
        it('should return "Paid" if dueBalance is zero or less', () => {
            const tenantPaid = { dueBalance: 0 };
            expect(getRecommendedPaymentStatus(tenantPaid)).toBe('Paid');

            const tenantWithCredit = { dueBalance: -100 };
            expect(getRecommendedPaymentStatus(tenantWithCredit)).toBe('Paid');
        });

        it('should return "Pending" if it is on or before the 5th of the month and balance is due', () => {
            const tenant = { dueBalance: 1000 };
            const date = new Date('2023-03-05');
            expect(getRecommendedPaymentStatus(tenant, date)).toBe('Pending');
        });
        
        it('should return "Overdue" if it is after the 5th of the month and balance is due', () => {
            const tenant = { dueBalance: 1000 };
            const date = new Date('2023-03-06');
            expect(getRecommendedPaymentStatus(tenant, date)).toBe('Overdue');
        });
    });

    describe('validatePayment', () => {
        const tenant = createMockTenant({ lease: { startDate: '2023-01-15' } });

        it('should throw an error for negative payment amounts', () => {
            expect(() => validatePayment(-100, new Date(), tenant, 'Rent')).toThrow('Invalid payment amount: Ksh -100. Amount must be positive.');
        });

        it('should throw an error for zero payment amount', () => {
            expect(() => validatePayment(0, new Date(), tenant, 'Rent')).toThrow('Invalid payment amount: Ksh 0. Amount must be positive.');
        });

        it('should throw an error for payments exceeding the maximum value', () => {
            expect(() => validatePayment(1000001, new Date(), tenant, 'Rent')).toThrow('Payment amount Ksh 1,000,001 exceeds the maximum limit of Ksh 1,000,000.');
        });

        it('should throw an error for future payment dates', () => {
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + 1);
            expect(() => validatePayment(1000, futureDate, tenant, 'Rent')).toThrow(/Date cannot be in the future/);
        });

        it('should throw an error for payment dates before the lease start date', () => {
            const beforeLeaseDate = new Date('2023-01-14');
            expect(() => validatePayment(1000, beforeLeaseDate, tenant, 'Rent')).toThrow(/Date cannot be before the lease start date/);
        });

        it('should not throw for a valid payment', () => {
            const validDate = new Date('2023-02-01');
            expect(() => validatePayment(20000, validDate, tenant, 'Rent')).not.toThrow();
        });

        it('should not throw for a payment on the lease start date', () => {
            const leaseStartDate = new Date('2023-01-15');
            expect(() => validatePayment(20000, leaseStartDate, tenant, 'Rent')).not.toThrow();
        });
    });

    describe('calculateTransactionBreakdown', () => {
        it('should calculate standard 5% management fee and service charge deduction', () => {
            const tenant = createMockTenant({ lease: { rent: 20000 } });
            const unit = createMockUnit({ rentAmount: 20000, serviceCharge: 3000, managementStatus: 'Rented for Soil Merchants' });
            const payment = createMockPayment({ amount: 20000 });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);

            expect(breakdown.gross).toBe(20000);
            expect(breakdown.serviceChargeDeduction).toBe(3000);
            expect(breakdown.managementFee).toBe(1000); // 5% of 20000
            expect(breakdown.netToLandlord).toBe(16000); // 20000 - 3000 - 1000
        });

        it('should calculate 50% commission for first month on a "Rented for Clients" unit', () => {
            const tenant = createMockTenant({
                lease: {
                    rent: 40000,
                    startDate: '2023-05-01',
                },
            });
            const unit = createMockUnit({
                rentAmount: 40000,
                serviceCharge: 5000,
                managementStatus: 'Rented for Clients',
            });
            const payment = createMockPayment({
                amount: 40000,
                rentForMonth: '2023-05', // This matches the tenant's start month
            });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);

            expect(breakdown.gross).toBe(40000);
            expect(breakdown.serviceChargeDeduction).toBe(5000);
            expect(breakdown.managementFee).toBe(20000); // 50% of 40000
            expect(breakdown.netToLandlord).toBe(15000); // 40000 - 5000 - 20000
        });

        it('should revert to 5% commission on the second month for a "Rented for Clients" unit', () => {
            const tenant = createMockTenant({
                lease: {
                    rent: 40000,
                    startDate: '2023-05-01',
                },
            });
            const unit = createMockUnit({
                rentAmount: 40000,
                serviceCharge: 5000,
                managementStatus: 'Rented for Clients',
            });
            const payment = createMockPayment({
                amount: 40000,
                rentForMonth: '2023-06', // Second month
            });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);

            expect(breakdown.gross).toBe(40000);
            expect(breakdown.serviceChargeDeduction).toBe(5000);
            expect(breakdown.managementFee).toBe(2000); // 5% of 40000
            expect(breakdown.netToLandlord).toBe(33000); // 40000 - 5000 - 2000
        });

        it('should use standard 5% fee for "Rented for Soil Merchants" units even on first month', () => {
            const tenant = createMockTenant({
                lease: { rent: 50000, startDate: '2023-09-01' }
            });
            const unit = createMockUnit({
                rentAmount: 50000,
                serviceCharge: 6000,
                managementStatus: 'Rented for Soil Merchants',
            });
            const payment = createMockPayment({
                amount: 50000,
                rentForMonth: '2023-09' // First month
            });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);

            expect(breakdown.gross).toBe(50000);
            expect(breakdown.serviceChargeDeduction).toBe(6000);
            expect(breakdown.managementFee).toBe(2500); // 5% of 50000
            expect(breakdown.netToLandlord).toBe(41500); // 50000 - 6000 - 2500
        });

        it('should handle missing unit or tenant gracefully', () => {
            const tenant = createMockTenant({ lease: { rent: 20000 } });
            const unit = createMockUnit({ rentAmount: 20000, serviceCharge: 3000 });
            const payment = createMockPayment({ amount: 20000 });

            // Case 1: Unit is undefined, but tenant has rent info
            const breakdown1 = calculateTransactionBreakdown(payment, undefined, tenant);
            expect(breakdown1.gross).toBe(20000);
            expect(breakdown1.serviceChargeDeduction).toBe(0); // No unit, no service charge
            expect(breakdown1.managementFee).toBe(1000); // 5% of tenant's rent
            expect(breakdown1.netToLandlord).toBe(19000); // 20000 - 0 - 1000

            // Case 2: Tenant is undefined, but unit has rent info
            const breakdown2 = calculateTransactionBreakdown(payment, unit, undefined);
            expect(breakdown2.gross).toBe(20000);
            expect(breakdown2.serviceChargeDeduction).toBe(3000); // Has unit, so has service charge
            expect(breakdown2.managementFee).toBe(1000); // 5% of unit's rent (20000)
            expect(breakdown2.netToLandlord).toBe(16000); // 20000 - 3000 - 1000
        });

        it('should correctly calculate net payout when payment amount differs from rent', () => {
            const tenant = createMockTenant({ lease: { rent: 20000 } });
            const unit = createMockUnit({ rentAmount: 20000, serviceCharge: 3000 });
            // Tenant makes a partial payment
            const payment = createMockPayment({ amount: 10000 });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);

            expect(breakdown.gross).toBe(10000);
            expect(breakdown.serviceChargeDeduction).toBe(3000);
            expect(breakdown.managementFee).toBe(1000); // Fee is based on standard rent
            expect(breakdown.netToLandlord).toBe(6000); // 10000 - 3000 - 1000
        });
    });
});
