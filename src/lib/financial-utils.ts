
import { Payment, Property, Tenant, Unit } from "./types";

/**
 * Calculates the breakdown of a rent payment, including management fees and service charges.
 * 
 * Logic:
 * 1. Gross Amount = The unit's standard rent amount.
 * 2. Management Fee = 5% of the Gross Rent Amount.
 * 3. Service Charge = The unit's standard service charge.
 * 4. Net to Landlord = Gross - Service Charge - Management Fee.
 * 
 * @param rentAmount The standard monthly rent for the unit.
 * @param serviceCharge The service charge amount for the unit.
 */
export function calculateTransactionBreakdown(rentAmount: number, serviceCharge: number = 0) {
    const grossAmount = rentAmount;

    // Management fee is 5% of the Gross Rent Amount.
    const managementFeeRate = 0.05;
    const managementFee = grossAmount * managementFeeRate;
    
    // The service charge is deducted from the gross.
    const serviceChargeDeduction = serviceCharge;

    // Net to landlord is what's left after service charge and management fee are deducted.
    const netToLandlord = grossAmount - serviceChargeDeduction - managementFee;

    return {
        gross: grossAmount,
        serviceChargeDeduction: serviceChargeDeduction,
        managementFee: managementFee,
        netToLandlord: netToLandlord,
    };
}

export interface FinancialSummary {
    totalRevenue: number;
    totalManagementFees: number;
    totalServiceCharges: number;
    totalNetRemittance: number;
    transactionCount: number;
}

export function aggregateFinancials(payments: Payment[], tenants: Tenant[], properties: { property: Property, units: Unit[] }[]): FinancialSummary {
    let summary: FinancialSummary = {
        totalRevenue: 0,
        totalManagementFees: 0,
        totalServiceCharges: 0,
        totalNetRemittance: 0,
        transactionCount: payments.filter(p => p.status === 'completed' && p.type === 'Rent').length
    };

    const unitMap = new Map<string, Unit>();
    properties.forEach(p => {
        p.units.forEach(u => {
            unitMap.set(`${p.property.id}-${u.name}`, u);
        });
    });

    // Calculate potential monthly rent and service charges from all of the landlord's tenants.
    tenants.forEach(tenant => {
        summary.totalRevenue += tenant.lease?.rent || 0;
        
        // Get the most up-to-date service charge from the unit definition
        const unit = unitMap.get(`${tenant.propertyId}-${tenant.unitName}`);
        summary.totalServiceCharges += unit?.serviceCharge || tenant.lease?.serviceCharge || 0;
    });

    // Management fee is 5% of the total potential rent (total revenue).
    const managementFeeRate = 0.05;
    summary.totalManagementFees = summary.totalRevenue * managementFeeRate;

    // Net Rent Payout is Total Revenue - Total Service Charges - Management Fees.
    summary.totalNetRemittance = summary.totalRevenue - summary.totalServiceCharges - summary.totalManagementFees;

    return summary;
}
