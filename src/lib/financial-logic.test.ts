import { calculateTransactionBreakdown, aggregateFinancials } from './financial-utils';
import { Tenant, Unit, Payment, Property } from './types';
import { parseISO } from 'date-fns';

// Helper to create mock data with simplified inputs
const createMockUnit = (overrides: Partial<Unit>): Unit => ({
    name: 'Test Unit',
    status: 'rented',
    ownership: 'Landlord',
    unitType: 'One Bedroom',
    ...overrides,
});

const createMockTenant = (overrides: Partial<Tenant> & { lease: Partial<Tenant['lease']> }): Tenant => ({
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
    lease: {
        startDate: '2023-01-01',
        endDate: '2024-01-01',
        rent: 20000,
        paymentStatus: 'Paid',
        ...overrides.lease,
    },
    ...overrides,
});

const createMockPayment = (overrides: Partial<Payment>): Payment => ({
    id: 'test-payment',
    tenantId: 'test-tenant',
    amount: 20000,
    date: '2023-01-05',
    type: 'Rent',
    status: 'Paid',
    createdAt: new Date(),
    ...overrides,
});


describe('Financial Logic', () => {
    describe('calculateTransactionBreakdown', () => {
        
        it('should calculate a standard 5% management fee', () => {
            const unit = createMockUnit({ rentAmount: 20000, serviceCharge: 3000 });
            const tenant = createMockTenant({ lease: { rent: 20000 } });
            const payment = createMockPayment({ amount: 20000, rentForMonth: '2023-09' });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);
            
            expect(breakdown.gross).toBe(20000);
            expect(breakdown.serviceChargeDeduction).toBe(3000);
            expect(breakdown.managementFee).toBe(1000); // 5% of 20000
            expect(breakdown.netToLandlord).toBe(16000); // 20000 - 3000 - 1000
        });

        it('should calculate 50% commission for the first month of a "Rented for Clients" unit', () => {
            const unit = createMockUnit({ managementStatus: 'Rented for Clients', rentAmount: 50000, serviceCharge: 6000 });
            const tenant = createMockTenant({ lease: { startDate: '2023-08-01', rent: 50000 } });
            const payment = createMockPayment({ amount: 50000, rentForMonth: '2023-08' });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);
            
            expect(breakdown.gross).toBe(50000);
            expect(breakdown.serviceChargeDeduction).toBe(0); // Service charge is waived on first month
            expect(breakdown.managementFee).toBe(25000); // 50% of 50000
            expect(breakdown.netToLandlord).toBe(25000);
        });

        it('should revert to 5% fee for the second month of a "Rented for Clients" unit', () => {
            const unit = createMockUnit({ managementStatus: 'Rented for Clients', rentAmount: 50000, serviceCharge: 6000 });
            const tenant = createMockTenant({ lease: { startDate: '2023-08-01', rent: 50000 } });
            const payment = createMockPayment({ amount: 50000, rentForMonth: '2023-09' }); // Second month

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);

            expect(breakdown.gross).toBe(50000);
            expect(breakdown.serviceChargeDeduction).toBe(6000); // Service charge applies now
            expect(breakdown.managementFee).toBe(2500); // Back to 5% of 50000
            expect(breakdown.netToLandlord).toBe(41500); // 50000 - 6000 - 2500
        });

        it('should handle payments where tenant rent is discounted', () => {
            const unit = createMockUnit({ rentAmount: 20000, serviceCharge: 3000 }); // Standard rent is 20k
            const tenant = createMockTenant({ lease: { rent: 18000 } }); // Tenant pays discounted 18k
            const payment = createMockPayment({ amount: 18000 });

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);
            expect(breakdown.managementFee).toBe(1000); // Fee is based on standard rent
            expect(breakdown.netToLandlord).toBe(14000); // 18000 - 3000 - 1000
        });
        
         it('should handle payments where payment amount differs from rent (e.g. partial payment)', () => {
            const unit = createMockUnit({ rentAmount: 20000, serviceCharge: 3000 });
            const tenant = createMockTenant({ lease: { rent: 20000 } }); 
            const payment = createMockPayment({ amount: 10000 }); // Tenant pays only 10k

            const breakdown = calculateTransactionBreakdown(payment, unit, tenant);
            expect(breakdown.gross).toBe(10000);
            expect(breakdown.managementFee).toBe(1000); // Fee is based on standard rent
            expect(breakdown.netToLandlord).toBe(6000); // 10000 - 3000 - 1000
        });
    });

    describe('aggregateFinancials', () => {
        const mockUnitSM = createMockUnit({ name: 'A1', ownership: 'SM', rentAmount: 20000, serviceCharge: 3000 });
        const mockUnitLandlord = createMockUnit({ name: 'B2', ownership: 'Landlord', landlordId: 'l-1', rentAmount: 40000, serviceCharge: 5000 });
        const mockUnitVacantHandedOver = createMockUnit({ name: 'C3', ownership: 'Landlord', landlordId: 'l-1', status: 'vacant', handoverStatus: 'Handed Over', serviceCharge: 4500 });
        const mockUnitVacantNotHandedOver = createMockUnit({ name: 'D4', ownership: 'Landlord', landlordId: 'l-1', status: 'vacant', handoverStatus: 'Pending Hand Over', serviceCharge: 4000 });
    
        const mockProperty: Property = {
            id: 'prop-1', name: 'Test Prop', address: '123 St', type: 'Residential', imageId: '1',
            units: [mockUnitSM, mockUnitLandlord, mockUnitVacantHandedOver, mockUnitVacantNotHandedOver]
        };
    
        const mockTenantA1 = createMockTenant({ id: 't-A1', unitName: 'A1', propertyId: 'prop-1', lease: { rent: 20000 } });
        const mockTenantB2 = createMockTenant({ id: 't-B2', unitName: 'B2', propertyId: 'prop-1', lease: { rent: 40000 } });
        const mockTenants = [mockTenantA1, mockTenantB2];
        
        it('should correctly aggregate financials from multiple payments', () => {
            const payments = [
                createMockPayment({ tenantId: 't-A1', amount: 20000 }), // SM unit
                createMockPayment({ tenantId: 't-B2', amount: 40000 })  // Landlord unit
            ];
            
            const summary = aggregateFinancials(payments, mockTenants, [{ property: mockProperty, units: mockProperty.units }]);
    
            expect(summary.totalRevenue).toBe(60000);
            expect(summary.totalManagementFees).toBe(3000); // 1k (5% of 20k) + 2k (5% of 40k)
            expect(summary.totalServiceCharges).toBe(8000); // 3k + 5k
            expect(summary.vacantUnitServiceChargeDeduction).toBe(4500); // Only C3
            expect(summary.totalNetRemittance).toBe(44500); // 60k - 8k - 3k - 4.5k
        });
    
        it('should handle first-month commission correctly in aggregation', () => {
             const firstMonthUnit = createMockUnit({ 
                name: 'F1', 
                managementStatus: 'Rented for Clients', 
                rentAmount: 50000, 
                serviceCharge: 6000,
                propertyId: 'prop-1',
            });
            const firstMonthTenant = createMockTenant({ 
                id: 't-F1', 
                unitName: 'F1',
                propertyId: 'prop-1',
                lease: { startDate: '2023-08-01', rent: 50000 } 
            });
            const firstMonthPayment = createMockPayment({ 
                tenantId: 't-F1', 
                amount: 50000, 
                rentForMonth: '2023-08' 
            });
    
            const summary = aggregateFinancials([firstMonthPayment], [firstMonthTenant], [{ property: { ...mockProperty, units: [firstMonthUnit] }, units: [firstMonthUnit] }]);
            
            expect(summary.totalRevenue).toBe(50000);
            expect(summary.totalServiceCharges).toBe(0);
            expect(summary.totalManagementFees).toBe(25000); // 50% commission
            expect(summary.vacantUnitServiceChargeDeduction).toBe(0);
            expect(summary.totalNetRemittance).toBe(25000);
        });
    
        it('should return zero for all fields if there are no payments', () => {
            const summary = aggregateFinancials([], mockTenants, [{ property: mockProperty, units: mockProperty.units }]);
            expect(summary.totalRevenue).toBe(0);
            expect(summary.totalManagementFees).toBe(0);
            expect(summary.totalServiceCharges).toBe(0); // This is from payments, so should be 0
            expect(summary.vacantUnitServiceChargeDeduction).toBe(4500); // This is calculated regardless of payments
            expect(summary.totalNetRemittance).toBe(-4500);
        });
    });
});
