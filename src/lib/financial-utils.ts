
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
        
        // Use the actual rent amount defined for the unit for calculations, as per the business logic.
        const rentAmount = unit?.rentAmount || tenant?.lease?.rent || 0;
        const serviceCharge = unit?.serviceCharge || tenant?.lease?.serviceCharge || 0;

        const breakdown = calculateTransactionBreakdown(rentAmount, serviceCharge);

        summary.totalRevenue += breakdown.gross;
        summary.totalManagementFees += breakdown.managementFee;
        summary.totalServiceCharges += breakdown.serviceChargeDeduction;
    });

    // Calculate service charge for vacant units.
    let vacantUnitDeduction = 0;
    properties.forEach(p => {
      p.units.forEach(u => {
        if (u.status === 'vacant') {
          vacantUnitDeduction += u.serviceCharge || 0;
        }
      });
    });
    summary.vacantUnitServiceChargeDeduction = vacantUnitDeduction;

    // Final Net Rent Payout calculation.
    summary.totalNetRemittance = summary.totalRevenue - summary.totalServiceCharges - summary.totalManagementFees - vacantUnitDeduction;

    return summary;
}
