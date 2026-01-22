
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
    // If the amount is less than service charge, we assume it all goes to service charge arrears first
    // But for simplicity in this version, we stick to the standard model where:
    // Rent = Amount - Service Charge

    // Safety check: specific payments might not have service charge included if they are partial
    // For now, we rely on the defined service charge amount

    // If the payment is explicitly marked as "Deposit" or "Other", different rules might apply
    // maximizing robustness here for "Rent"

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
        if (payment.status !== 'completed') return;

        const tenant = tenants.find(t => t.id === payment.tenantId);
        // Default service charge to 0 if not found
        const serviceCharge = tenant?.lease?.serviceCharge || 0;

        // We only apply this logic to Rent payments currently
        if (payment.type === 'Rent') {
            const breakdown = calculateTransactionBreakdown(payment.amount, serviceCharge);

            summary.totalRevenue += breakdown.rentCollected; // Landlord revenue is based on rent portion only
            summary.totalManagementFees += breakdown.managementFee;
            summary.totalServiceCharges += breakdown.serviceChargeDeduction;
            summary.totalNetRemittance += breakdown.netToLandlord;
            summary.transactionCount++;
        }
    });

    return summary;
}
