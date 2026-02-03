
import { calculateTransactionBreakdown, aggregateFinancials, generateLedger, reconcileMonthlyBilling } from './financial-logic';
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
             });
             (firstMonthUnit as any).propertyId = 'prop-1'; // Add propertyId for map key
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

    describe('generateLedger', () => {
        const mockProperty = createMockProperty('prop-1', [
            createMockUnit({ name: 'A1', rentAmount: 20000, serviceCharge: 3000 }),
            createMockUnit({ name: 'B2', rentAmount: 40000, serviceCharge: 5000 }),
        ]);
        const mockProperties = [mockProperty];
    
        it('should generate a correct ledger for a standard tenant', () => {
            const tenant = createMockTenant({ lease: { startDate: '2024-01-01', rent: 20000 }, securityDeposit: 20000 });
            const payments = [createMockPayment({ amount: 20000, date: '2024-01-05', rentForMonth: '2024-01' })];
            const { ledger, finalDueBalance } = generateLedger(tenant, payments, mockProperties);
            
            expect(ledger.find(l => l.description === 'Security Deposit')).toBeDefined();
            expect(ledger.find(l => l.description.startsWith('Rent for Units'))).toBeDefined();
            expect(ledger.find(l => l.description.startsWith('Payment Received'))).toBeDefined();
            expect(finalDueBalance).toBeGreaterThan(0); // Should still owe for other months
        });
    
        it('should correctly handle credit balances', () => {
            const tenant = createMockTenant({ dueBalance: 20000, lease: { startDate: '2024-01-01', rent: 20000 } });
            const payments = [createMockPayment({ amount: 25000, date: '2024-01-05', rentForMonth: '2024-01' })]; // Overpayment
            
            const { ledger, finalAccountBalance, finalDueBalance } = generateLedger(tenant, payments, mockProperties);
    
            const lastEntry = ledger[ledger.length - 1];
            expect(lastEntry.balance).toBeLessThan(0); // Negative balance indicates credit
            expect(finalAccountBalance).toBe(5000);
            expect(finalDueBalance).toBe(0);
        });
    
        describe('Homeowner Service Charge Handover Logic', () => {
    
            it('should waive current month for handover on or before the 10th', () => {
                const unit = createMockUnit({ name: 'C1', serviceCharge: 5000, handoverDate: '2024-01-10' });
                const owner = createMockOwner('owner-1', 'Homeowner A', [{ propertyId: 'prop-1', unitNames: ['C1'] }]);
                const tenant = createMockHomeownerTenant('tenant-C1', 'prop-1', 'C1', 5000, '2023-12-31');
                
                const { ledger } = generateLedger(tenant, [], [createMockProperty('prop-1', [unit])], owner);
    
                const janCharge = ledger.find(l => l.forMonth === 'Jan 2024' && l.charge > 0);
                const febCharge = ledger.find(l => l.forMonth === 'Feb 2024' && l.charge > 0);
    
                expect(janCharge).toBeUndefined(); // January should be waived
                expect(febCharge).toBeDefined(); // February should be billed
                expect(febCharge?.charge).toBe(5000);
            });
    
            it('should waive next month for handover after the 10th', () => {
                const unit = createMockUnit({ name: 'D1', serviceCharge: 6000, handoverDate: '2024-01-11' });
                const owner = createMockOwner('owner-1', 'Homeowner B', [{ propertyId: 'prop-1', unitNames: ['D1'] }]);
                const tenant = createMockHomeownerTenant('tenant-D1', 'prop-1', 'D1', 6000, '2023-12-31');
                
                const { ledger } = generateLedger(tenant, [], [createMockProperty('prop-1', [unit])], owner);
    
                const janCharge = ledger.find(l => l.forMonth === 'Jan 2024' && l.charge > 0);
                const febCharge = ledger.find(l => l.forMonth === 'Feb 2024' && l.charge > 0);
                const marCharge = ledger.find(l => l.forMonth === 'Mar 2024' && l.charge > 0);
    
                expect(janCharge).toBeDefined(); // January is billed
                expect(febCharge).toBeUndefined(); // February is waived
                expect(marCharge).toBeDefined(); // March is billed
            });
    
            it('should group service charges for a multi-unit owner', () => {
                const units = [
                    createMockUnit({ name: 'E1', serviceCharge: 2000, handoverDate: '2023-12-01'}),
                    createMockUnit({ name: 'E2', serviceCharge: 3000, handoverDate: '2023-12-01'}),
                ];
                const multiUnitProperty = createMockProperty('prop-2', units);
                const owner = createMockOwner('owner-multi', 'Multi Owner', [{ propertyId: 'prop-2', unitNames: ['E1', 'E2'] }]);
                // This tenant acts as the financial account holder for the owner
                const tenant = createMockHomeownerTenant('tenant-multi', 'prop-2', 'E1', 5000, '2023-12-31'); 
    
                const { ledger } = generateLedger(tenant, [], [multiUnitProperty], owner);
                
                const janCharge = ledger.find(l => l.description.startsWith('S.Charge for Units') && l.forMonth === 'Jan 2024');
    
                expect(janCharge).toBeDefined();
                expect(janCharge?.charge).toBe(5000); // 2000 + 3000
                expect(janCharge?.description).toContain('E1');
                expect(janCharge?.description).toContain('E2');
            });
        });
    });
});
