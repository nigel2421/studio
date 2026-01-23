
import { Payment, Property, Tenant, Unit } from "./types";

/**
 * Calculates the breakdown of a rent payment, including management fees and service charges.
 * 
 * Logic:
 * 1. Gross Amount = The unit's standard rent.
 * 2. Management Fee = 5% of the unit's standard rent amount.
 * 3. Service Charge = The unit's standard service charge.
 * 4. Net to Landlord = Gross Rent - Service Charge - Management Fee.
 * 
 * @param paymentAmount The actual amount paid (used for finding transactions, but not for gross calculation).
 * @param unitRent The standard monthly rent for the unit.
 * @param serviceCharge The service charge amount for the unit.
 */
export function calculateTransactionBreakdown(
    paymentAmount: number,
    unitRent: number,
    serviceCharge: number = 0
) {
    // Gross amount for the statement line item is the unit's standard rent.
    const grossAmount = unitRent;

    // Management fee is 5% of the standard rent for the unit.
    const managementFeeRate = 0.05;
    const managementFee = unitRent * managementFeeRate;
    
    // The service charge is deducted.
    const serviceChargeDeduction = serviceCharge;

    // Net to landlord is what's left after deductions from the standard rent.
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
    vacantUnitServiceChargeDeduction?: number;
}

export function aggregateFinancials(payments: Payment[], tenants: Tenant[], properties: { property: Property, units: Unit[] }[]): FinancialSummary {
    const summary: FinancialSummary = {
        totalRevenue: 0,
        totalManagementFees: 0,
        totalServiceCharges: 0,
        totalNetRemittance: 0,
        transactionCount: 0,
        vacantUnitServiceChargeDeduction: 0,
    };

    const unitMap = new Map<string, Unit>();
    properties.forEach(p => {
        p.units.forEach(u => {
            unitMap.set(`${p.property.id}-${u.name}`, u);
        });
    });

    const rentPayments = payments.filter(p => p.status === 'Paid' && p.type === 'Rent');
    summary.transactionCount = rentPayments.length;

    rentPayments.forEach(payment => {
        const tenant = tenants.find(t => t.id === payment.tenantId);
        const unit = tenant ? unitMap.get(`${tenant.propertyId}-${tenant.unitName}`) : undefined;
        
        const unitRent = unit?.rentAmount || tenant?.lease?.rent || 0;
        const unitServiceCharge = unit?.serviceCharge || tenant?.lease?.serviceCharge || 0;

        const breakdown = calculateTransactionBreakdown(payment.amount, unitRent, unitServiceCharge);

        summary.totalRevenue += breakdown.gross;
        summary.totalServiceCharges += breakdown.serviceChargeDeduction;
        summary.totalManagementFees += breakdown.managementFee;
        summary.totalNetRemittance += breakdown.netToLandlord;
    });

    // Calculate service charge for vacant units that have been handed over
    let vacantUnitDeduction = 0;
    properties.forEach(p => {
      p.units.forEach(u => {
        if (u.status === 'vacant' && u.handoverStatus === 'Handed Over') {
          vacantUnitDeduction += u.serviceCharge || 0;
        }
      });
    });
    summary.vacantUnitServiceChargeDeduction = vacantUnitDeduction;
    summary.totalNetRemittance -= vacantUnitDeduction; // Deduct from the final payout

    return summary;
}
