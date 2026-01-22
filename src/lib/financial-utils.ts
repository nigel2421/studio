
import { Payment, Property, Tenant, Unit } from "./types";

/**
 * Calculates the breakdown of a rent payment, including management fees and service charges.
 * 
 * Logic:
 * 1. Gross Amount = Total Payment
 * 2. Service Charge = Deducted from Gross first (retained for maintenance/sinking fund)
 * 3. Management Fee = 5% of the Rent portion (Gross - Service Charge)
 * 4. Net to Landlord = Rent - Management Fee
 * 
 * @param payment The payment transaction
 * @param serviceCharge The service charge amount for the unit (monthly)
 */
export function calculateTransactionBreakdown(amount: number, serviceCharge: number = 0) {
    // The portion of the payment that is rent is what's left after the service charge is covered.
    let rentPortion = Math.max(0, amount - serviceCharge);

    // Management fee is 5% of the Rent collected
    const managementFeeRate = 0.05;
    const managementFee = rentPortion * managementFeeRate;

    const netToLandlord = rentPortion - managementFee;

    return {
        gross: amount,
        serviceChargeDeduction: Math.min(amount, serviceCharge), // Can't deduct more than paid
        rentCollected: rentPortion,
        managementFee: managementFee,
        netToLandlord: netToLandlord
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

    // Calculate potential monthly rent and service charges from all of the landlord's tenants.
    tenants.forEach(tenant => {
        summary.totalRevenue += tenant.lease?.rent || 0;
        summary.totalServiceCharges += tenant.lease?.serviceCharge || 0;
    });

    // Management fee is 5% of the total potential rent (total revenue).
    const managementFeeRate = 0.05;
    summary.totalManagementFees = summary.totalRevenue * managementFeeRate;

    // Net Rent Payout is Total Revenue - Total Service Charges - Management Fees.
    summary.totalNetRemittance = summary.totalRevenue - summary.totalServiceCharges - summary.totalManagementFees;

    return summary;
}
