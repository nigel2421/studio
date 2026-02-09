
import { Payment, Property, Tenant, Unit } from "./types";
import { isSameMonth, parseISO, differenceInMonths, addMonths, format } from 'date-fns';

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

    const isEracovManaged = unit?.managementStatus !== 'Client Managed';
    const otherCosts = isEracovManaged && payment.type === 'Rent' ? 500 : 0;

    const netToLandlord = grossAmount - serviceChargeDeduction - managementFee - otherCosts;

    return {
        gross: grossAmount,
        serviceChargeDeduction: Math.round(serviceChargeDeduction),
        managementFee: Math.round(managementFee),
        otherCosts: otherCosts,
        netToLandlord: Math.round(netToLandlord),
    };
}

export interface FinancialSummary {
    totalRent: number;
    totalManagementFees: number;
    totalServiceCharges: number;
    totalOtherCosts: number;
    totalNetRemittance: number;
    transactionCount: number;
    vacantUnitServiceChargeDeduction?: number;
}

export function aggregateFinancials(payments: Payment[], tenants: Tenant[], properties: { property: Property, units: Unit[] }[]): FinancialSummary {
    const transactions = generateLandlordDisplayTransactions(payments, tenants, properties);

    const summary: FinancialSummary = {
        totalRent: 0,
        totalManagementFees: 0,
        totalServiceCharges: 0,
        totalOtherCosts: 0,
        totalNetRemittance: 0,
        transactionCount: transactions.length,
        vacantUnitServiceChargeDeduction: 0,
    };
    
    transactions.forEach(transaction => {
        summary.totalRent += transaction.gross;
        summary.totalServiceCharges += transaction.serviceChargeDeduction;
        summary.totalManagementFees += transaction.managementFee;
        summary.totalOtherCosts += transaction.otherCosts || 0;
        summary.totalNetRemittance += transaction.netToLandlord;
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


export function generateLandlordDisplayTransactions(
    payments: Payment[], 
    tenants: Tenant[], 
    properties: { property: Property, units: Unit[] }[]
) {
    const unitMap = new Map<string, Unit>();
    properties.forEach(p => {
        p.units.forEach(u => {
            unitMap.set(`${p.property.id}-${u.name}`, u);
        });
    });

    const transactions: any[] = [];
    const sortedPayments = [...payments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const tenantFirstPaymentMap = new Map<string, string>();
    tenants.forEach(tenant => {
        const firstPayment = sortedPayments.find(p => p.tenantId === tenant.id && p.type === 'Rent');
        if (firstPayment) {
            tenantFirstPaymentMap.set(tenant.id, firstPayment.id);
        }
    });

    sortedPayments.forEach(payment => {
        const tenant = tenants.find(t => t.id === payment.tenantId);
        if (!tenant || payment.type === 'Deposit') {
            return;
        }

        const unit = unitMap.get(`${tenant.propertyId}-${tenant.unitName}`);
        const unitRent = unit?.rentAmount || tenant?.lease?.rent || 0;
        const isFirstPaymentForTenant = tenantFirstPaymentMap.get(tenant.id) === payment.id;
        
        let amountToApportionAsRent = payment.amount;

        if (isFirstPaymentForTenant) {
            const totalDeposits = (tenant.securityDeposit || 0) + (tenant.waterDeposit || 0);
            if (payment.amount >= totalDeposits) {
                amountToApportionAsRent = payment.amount - totalDeposits;
            } else {
                amountToApportionAsRent = 0;
            }
        }
        
        if (amountToApportionAsRent <= 0) return;

        if (unitRent > 0 && amountToApportionAsRent > unitRent * 1.1) {
            let remainingAmount = amountToApportionAsRent;
            let monthIndex = 0;
            const leaseStartDate = parseISO(tenant.lease.startDate);

            while (remainingAmount >= unitRent) {
                const currentMonth = addMonths(leaseStartDate, monthIndex);
                const monthString = format(currentMonth, 'yyyy-MM');
                const virtualPayment: Payment = { ...payment, amount: unitRent, rentForMonth: monthString };
                const breakdown = calculateTransactionBreakdown(virtualPayment, unit, tenant);
                
                transactions.push({
                    id: `${payment.id}-${monthIndex}`,
                    date: payment.date,
                    unitName: tenant.unitName,
                    unitType: unit?.unitType || 'N/A',
                    forMonth: format(currentMonth, 'MMM yyyy'),
                    ...breakdown,
                });
                
                remainingAmount -= unitRent;
                monthIndex++;
            }

            if (remainingAmount > 1) {
                const nextMonth = addMonths(leaseStartDate, monthIndex);
                const virtualPayment: Payment = { ...payment, amount: remainingAmount, rentForMonth: format(nextMonth, 'yyyy-MM') };
                const breakdown = calculateTransactionBreakdown(virtualPayment, unit, tenant);

                transactions.push({
                    id: `${payment.id}-rem`,
                    date: payment.date,
                    unitName: tenant.unitName,
                    unitType: unit?.unitType || 'N/A',
                    forMonth: `Partial - ${format(nextMonth, 'MMM yyyy')}`,
                    ...breakdown,
                });
            }
        } else {
            const paymentForBreakdown = { ...payment, amount: amountToApportionAsRent };
            const breakdown = calculateTransactionBreakdown(paymentForBreakdown, unit, tenant);
            transactions.push({
                id: payment.id,
                date: payment.date,
                unitName: tenant.unitName,
                unitType: unit?.unitType || 'N/A',
                forMonth: payment.rentForMonth ? format(parseISO(payment.rentForMonth + '-02'), 'MMM yyyy') : 'N/A',
                ...breakdown,
            });
        }
    });
    
    return transactions;
}
