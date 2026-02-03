

import { Payment, Property, Tenant, Unit } from "./types";
import { isSameMonth, parseISO } from 'date-fns';

/**
 * Calculates the breakdown of a rent payment, including management fees and service charges.
 * 
 * Logic:
 * 1. Gross Amount = The actual payment amount made.
 * 2. Management Fee:
 *    - For "Rented for Clients" units, it's 50% for the first month of a new tenant (calculated on standard rent).
 *    - Otherwise, it's 5% of the unit's standard rent. For lump-sum payments, this is pro-rated.
 * 3. Service Charge = The unit's standard service charge. This is WAIVED for the first month on a "Rented for Clients" unit. For lump-sum payments, this is pro-rated.
 * 4. Net to Landlord = Gross Payment - Service Charge - Management Fee.
 * 
 * @param payment The payment object.
 * @param unit The unit associated with the payment.
 * @param tenant The tenant associated with the payment.
 */
export function calculateTransactionBreakdown(
    payment: Payment,
    unit: Unit | undefined,
    tenant: Tenant | undefined
) {
    const unitRent = unit?.rentAmount || tenant?.lease?.rent || 0;
    const serviceCharge = unit?.serviceCharge || tenant?.lease?.serviceCharge || 0;
    const grossAmount = payment.amount || 0;
    
    let serviceChargeDeduction = serviceCharge;
    let managementFee = 0;
    const standardManagementFeeRate = 0.05;

    const isFirstMonthForClientRental =
        unit?.managementStatus === 'Rented for Clients' &&
        tenant?.lease?.startDate &&
        payment.rentForMonth &&
        isSameMonth(parseISO(tenant.lease.startDate), parseISO(`${payment.rentForMonth}-01`));

    if (isFirstMonthForClientRental) {
        managementFee = unitRent * 0.50;
        serviceChargeDeduction = 0; // Service charge is waived for the first month in this scenario.
    } else {
        // Handle standard fees, pro-rating for lump-sum payments
        if (unitRent > 0 && payment.type === 'Rent') {
            const rentRatio = grossAmount / unitRent;
            managementFee = (unitRent * standardManagementFeeRate) * rentRatio;
            serviceChargeDeduction = serviceCharge * rentRatio;
        } else {
            // Fallback for non-rent payments or zero rent
            managementFee = unitRent * standardManagementFeeRate;
        }
    }

    const netToLandlord = grossAmount - serviceChargeDeduction - managementFee;

    return {
        gross: grossAmount,
        serviceChargeDeduction: Math.round(serviceChargeDeduction),
        managementFee: Math.round(managementFee),
        netToLandlord: Math.round(netToLandlord),
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
        
        const breakdown = calculateTransactionBreakdown(payment, unit, tenant);

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
