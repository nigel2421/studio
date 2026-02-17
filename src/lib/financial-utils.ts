
import { Payment, Property, Tenant, Unit } from "./types";
import { isSameMonth, parseISO, differenceInMonths, addMonths, format, isWithinInterval, startOfMonth } from 'date-fns';

/**
 * Calculates the breakdown of a rent payment, including management fees and service charges.
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
        managementFee = unitRent * 0.50;
        serviceChargeDeduction = 0;
    } else {
        if (unitRent > 0 && payment.type === 'Rent') {
            const rentRatio = Math.min(1, grossAmount / unitRent); // Ensure ratio is not > 1
            managementFee = (unitRent * standardManagementFeeRate) * rentRatio;
            serviceChargeDeduction = serviceCharge * rentRatio;
        } else {
            managementFee = 0; // No management fee on non-rent or zero-rent payments
            serviceChargeDeduction = serviceCharge;
        }
    }
    
    const isEracovManaged = unit?.managementStatus === 'Rented for Clients' || unit?.managementStatus === 'Rented for Soil Merchants' || unit?.managementStatus === 'Airbnb';
    const otherCosts = isEracovManaged && payment.type === 'Rent' && grossAmount > 0 ? 1000 : 0;

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

export function aggregateFinancials(payments: Payment[], tenants: Tenant[], properties: Property[], startDate?: Date, endDate?: Date): FinancialSummary {
    const transactions = generateLandlordDisplayTransactions(payments, tenants, properties, startDate, endDate);

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

    let vacantUnitDeduction = 0;
    if (startDate && endDate) {
        const start = startOfMonth(startDate);
        const end = startOfMonth(endDate);
        
        let loopDate = start;
        while(loopDate <= end) {
            properties.forEach(p => {
              (p.units || []).forEach(u => {
                const isOccupied = tenants.some(t => t.propertyId === p.id && t.unitName === u.name);
                if (!isOccupied && u.status === 'vacant' && u.handoverStatus === 'Handed Over' && u.serviceCharge) {
                  vacantUnitDeduction += u.serviceCharge;
                }
              });
            });
            loopDate = addMonths(loopDate, 1);
        }
    }
    summary.vacantUnitServiceChargeDeduction = vacantUnitDeduction;
    summary.totalNetRemittance -= vacantUnitDeduction;

    return summary;
}


export function generateLandlordDisplayTransactions(
    payments: Payment[], 
    tenants: Tenant[], 
    properties: Property[],
    startDate?: Date, 
    endDate?: Date
) {
    const unitMap = new Map<string, Unit>();
    properties.forEach(p => {
        (p.units || []).forEach(u => {
            unitMap.set(`${p.id}-${u.name}`, u);
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
        if (!tenant || payment.type === 'Deposit' || payment.type === 'Water') {
            return;
        }

        const paymentDate = parseISO(payment.date);
        if (startDate && endDate && !isWithinInterval(paymentDate, { start: startDate, end: endDate })) {
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

            while (remainingAmount > 0) {
                const currentMonth = startOfMonth(addMonths(leaseStartDate, monthIndex));
                const rentForThisIteration = Math.min(remainingAmount, unitRent);
                
                const monthString = format(currentMonth, 'yyyy-MM');
                const virtualPayment: Payment = { ...payment, amount: rentForThisIteration, rentForMonth: monthString, type: 'Rent' };
                const breakdown = calculateTransactionBreakdown(virtualPayment, unit, tenant);
                
                transactions.push({
                    id: `${payment.id}-${monthIndex}`,
                    date: payment.date,
                    unitName: tenant.unitName,
                    unitType: unit?.unitType || 'N/A',
                    forMonth: format(currentMonth, 'MMM yyyy'),
                    ...breakdown,
                });
                
                remainingAmount -= rentForThisIteration;
                if (remainingAmount < 1) break;
                monthIndex++;
            }
        } else {
            const paymentForBreakdown: Payment = { ...payment, amount: Math.min(amountToApportionAsRent, unitRent), type: 'Rent' };
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
