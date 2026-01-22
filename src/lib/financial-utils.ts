
import { Payment, Tenant } from "./types";

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

export function aggregateFinancials(payments: Payment[], tenants: Tenant[]): FinancialSummary {
    let summary: FinancialSummary = {
        totalRevenue: 0,
        totalManagementFees: 0,
        totalServiceCharges: 0,
        totalNetRemittance: 0,
        transactionCount: 0
    };

    payments.forEach(payment => {
        // Explicitly only count 'Rent' type payments towards landlord revenue.
        // Deposits and other types are excluded.
        if (payment.status !== 'completed' || payment.type !== 'Rent') return;

        const tenant = tenants.find(t => t.id === payment.tenantId);
        const serviceCharge = tenant?.lease?.serviceCharge || 0;

        const breakdown = calculateTransactionBreakdown(payment.amount, serviceCharge);

        summary.totalRevenue += breakdown.rentCollected;
        summary.totalManagementFees += breakdown.managementFee;
        summary.totalServiceCharges += breakdown.serviceChargeDeduction;
        summary.totalNetRemittance += breakdown.netToLandlord;
        summary.transactionCount++;
    });

    return summary;
}
