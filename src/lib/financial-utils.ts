import { Payment, Property, Tenant, Unit } from "./types";
import { isSameMonth, parseISO, differenceInMonths } from 'date-fns';

/**
 * Calculates the breakdown of a rent payment, including management fees and service charges.
 * 
 * Logic:
 * 1. Gross Amount = The actual payment amount made.
 * 2. Management Fee:
 *    - For "Rented for Clients" units on their first-ever letting, it's 50% for the first month of a new tenant.
 *    - Otherwise, it's 5% of the unit's standard rent. For lump-sum payments, this is pro-rated.
 * 3. Service Charge = The unit's standard service charge. This is WAIVED for the landlord on the first month of an initial letting. For lump-sum payments, this is pro-rated.
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

    const isRentedForClients = unit?.managementStatus === 'Rented for Clients';
    const isFirstMonthOfLease = tenant?.lease?.startDate && payment.rentForMonth && isSameMonth(parseISO(tenant.lease.startDate), parseISO(`${payment.rentForMonth}-01`));

    // Determine if this is the initial letting of the unit after it was handed over.
    // We consider it "initial" if the lease starts within 3 months of the handover.
    // This helps differentiate a true first-time letting from a subsequent re-letting.
    let isInitialLettingAfterHandover = false;
    if (isRentedForClients && isFirstMonthOfLease && unit?.handoverDate && tenant?.lease?.startDate) {
        try {
            const handoverDate = parseISO(unit.handoverDate);
            const leaseStartDate = parseISO(tenant.lease.startDate);
            if (differenceInMonths(leaseStartDate, handoverDate) < 3) {
                isInitialLettingAfterHandover = true;
            }
        } catch (e) {
            console.error("Error parsing dates for letting check:", e);
        }
    }

    if (isRentedForClients && isFirstMonthOfLease && isInitialLettingAfterHandover) {
        // Special 50% first-month commission for a new letting.
        managementFee = unitRent * 0.50;
        // Service charge is waived for the landlord for the very first month's rent collection.
        serviceChargeDeduction = 0;
    } else {
        // Standard fee calculation for all other months or scenarios.
        if (unitRent > 0 && payment.type === 'Rent') {
            // Pro-rate deductions for lump-sum payments that cover multiple months.
            const rentRatio = grossAmount / unitRent;
            managementFee = (unitRent * standardManagementFeeRate) * rentRatio;
            serviceChargeDeduction = serviceCharge * rentRatio;
        } else {
            // Fallback for non-rent payments or if rent is zero.
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
    totalRent: number;
    totalManagementFees: number;
    totalServiceCharges: number;
    totalNetRemittance: number;
    transactionCount: number;
    vacantUnitServiceChargeDeduction?: number;
}

export function aggregateFinancials(payments: Payment[], tenants: Tenant[], properties: { property: Property, units: Unit[] }[]): FinancialSummary {
    const summary: FinancialSummary = {
        totalRent: 0,
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

        summary.totalRent += breakdown.gross;
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
