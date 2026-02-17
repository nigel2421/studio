

import { Payment, Property, Tenant, Unit, Landlord, UnitType, FinancialSummary } from "./types";
import { isSameMonth, parseISO, differenceInMonths, addMonths, format, isWithinInterval, startOfMonth, isBefore, isAfter } from 'date-fns';

interface DisplayTransaction {
    id: string;
    date: string;
    propertyId: string;
    unitName: string;
    unitType: UnitType | 'N/A';
    rentForMonth: string;
    forMonthDisplay: string;
    gross: number;
    serviceChargeDeduction: number;
    managementFee: number;
    otherCosts: number;
    netToLandlord: number;
    stageTwoCost: number;
    stageThreeCost: number;
    specialDeductions: number;
}


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
            // Only deduct service charge if it's not a 50% commission deal (initial letting)
            serviceChargeDeduction = serviceCharge * rentRatio;
        } else {
            managementFee = 0; // No management fee on non-rent or zero-rent payments
            serviceChargeDeduction = serviceCharge;
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

export function aggregateFinancials(
    allTransactions: any[],
    properties: Property[], 
    tenants: Tenant[],
    startDate?: Date, 
    endDate?: Date, 
    landlord?: Landlord | null
): FinancialSummary {
    const transactions = allTransactions.filter(t => {
        if (!startDate || !endDate) return true;
        try {
            const transactionDate = parseISO(t.date);
            return isWithinInterval(transactionDate, { start: startDate, end: endDate });
        } catch(e) {
            return false;
        }
    });

    const summary: FinancialSummary = {
        totalRent: 0,
        totalManagementFees: 0,
        totalServiceCharges: 0,
        totalOtherCosts: 0,
        totalStageTwoCost: 0,
        totalStageThreeCost: 0,
        totalNetRemittance: 0,
        transactionCount: transactions.length,
        vacantUnitServiceChargeDeduction: 0,
    };
    
    transactions.forEach((transaction: DisplayTransaction) => {
        summary.totalRent += transaction.gross;
        summary.totalServiceCharges += transaction.serviceChargeDeduction;
        summary.totalManagementFees += transaction.managementFee;
        summary.totalOtherCosts += transaction.otherCosts || 0;
        summary.totalStageTwoCost += transaction.stageTwoCost || 0;
        summary.totalStageThreeCost += transaction.stageThreeCost || 0;
        summary.totalNetRemittance += transaction.netToLandlord;
    });

    let vacantUnitDeduction = 0;
    if (startDate && endDate && landlord) {
        const start = startOfMonth(startDate);
        const end = startOfMonth(endDate);
        
        const landlordUnits = properties.flatMap(p => 
            (p.units || []).filter(u => u.landlordId === landlord.id)
        );
        
        let loopDate = start;
        while(isBefore(loopDate, end) || isSameMonth(loopDate, end)) {
            landlordUnits.forEach(u => {
                const isOccupied = tenants.some(t => t.unitName === u.name && t.propertyId === u.propertyId);

                if (!isOccupied && u.status === 'vacant' && u.handoverStatus === 'Handed Over' && u.serviceCharge && u.handoverDate) {
                  const handoverDate = parseISO(u.handoverDate);
                  const handoverDay = handoverDate.getDate();

                  const firstBillableMonth = handoverDay <= 10
                      ? startOfMonth(addMonths(handoverDate, 1))
                      : startOfMonth(addMonths(handoverDate, 2));
                  
                  if (isSameMonth(loopDate, firstBillableMonth) || isAfter(loopDate, firstBillableMonth)) {
                      vacantUnitDeduction += u.serviceCharge;
                  }
                }
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
    landlord: Landlord | null,
    startDate?: Date,
    endDate?: Date
): DisplayTransaction[] {
    const landlordId = landlord?.id;
    const unitMap = new Map<string, Unit>();
    const landlordUnits = new Map<string, Unit>();
    properties.forEach(p => {
        (p.units || []).forEach(u => {
            const unitWithProp = { ...u, propertyId: p.id };
            unitMap.set(`${p.id}-${u.name}`, unitWithProp);
            if (u.landlordId === landlordId || (landlordId === 'soil_merchants_internal' && u.ownership === 'SM')) {
                landlordUnits.set(u.name, unitWithProp);
            }
        });
    });

    const tenantMap = new Map(tenants.map(t => [t.id, t]));

    const filteredPayments = payments.filter(p => {
        if (!startDate || !endDate) return true;
        const paymentDate = parseISO(p.date);
        return isWithinInterval(paymentDate, { start: startDate, end: endDate });
    });

    let transactions: DisplayTransaction[] = [];
    
    const sortedPayments = [...filteredPayments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const tenantFirstPaymentMap = new Map<string, string>();
    tenants.forEach(tenant => {
        const firstPayment = sortedPayments.find(p => p.tenantId === tenant.id && p.type === 'Rent');
        if (firstPayment) {
            tenantFirstPaymentMap.set(tenant.id, firstPayment.id);
        }
    });

    sortedPayments.forEach(payment => {
        const tenant = tenantMap.get(payment.tenantId);
        if (!tenant || payment.type !== 'Rent') {
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
        
        if (amountToApportionAsRent <= 0 || unitRent <= 0) return;

        let remainingAmount = amountToApportionAsRent;
        let monthIndex = 0;
        const leaseStartDate = parseISO(tenant.lease.startDate);

        while (remainingAmount > 0 && monthIndex < 24) { 
            const rentForThisIteration = Math.min(remainingAmount, unitRent);
            const currentMonth = addMonths(leaseStartDate, monthIndex);
            
            const virtualPayment: Payment = { ...payment, amount: rentForThisIteration, rentForMonth: format(currentMonth, 'yyyy-MM'), type: 'Rent' };
            const breakdown = calculateTransactionBreakdown(virtualPayment, unit, tenant);
            
            transactions.push({
                id: `${payment.id}-${monthIndex}`,
                date: payment.date,
                propertyId: tenant.propertyId,
                unitName: tenant.unitName,
                unitType: unit?.unitType || 'N/A',
                rentForMonth: format(currentMonth, 'yyyy-MM'),
                forMonthDisplay: format(currentMonth, 'MMM yyyy'),
                netToLandlord: breakdown.netToLandlord, // Will be recalculated later
                gross: breakdown.gross,
                serviceChargeDeduction: breakdown.serviceChargeDeduction,
                managementFee: breakdown.managementFee,
                otherCosts: 0,
                stageTwoCost: 0,
                stageThreeCost: 0,
                specialDeductions: 0
            });
            
            remainingAmount -= rentForThisIteration;
            monthIndex++;
        }
    });

    transactions.sort((a,b) => {
        const dateA = new Date(a.date).getTime();
        const dateB = new Date(b.date).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return a.unitName.localeCompare(b.unitName);
    });

    // Post-process to apply special costs and carry-overs
    const processedForSpecialDeduction = new Set<string>();
    const processedForOtherCosts = new Set<string>();

    transactions.forEach(t => {
        // Special Deductions (one-time per unit)
        if (landlord && !processedForSpecialDeduction.has(t.unitName)) {
            const unit = landlordUnits.get(t.unitName);
            let stageTwo = 0;
            let stageThree = 0;

            if (landlord.deductStageTwoCost) {
                stageTwo = 10000;
            }
            if (landlord.deductStageThreeCost && unit) {
                switch (unit.unitType) {
                    case 'Studio': stageThree = 8000; break;
                    case 'One Bedroom': stageThree = 12000; break;
                    case 'Two Bedroom': stageThree = 16000; break;
                }
            }
            
            t.stageTwoCost = stageTwo;
            t.stageThreeCost = stageThree;
            t.specialDeductions = stageTwo + stageThree;
            processedForSpecialDeduction.add(t.unitName);
        }

        // Other Costs (transaction fee)
        const isJanuary = new Date(t.rentForMonth + '-02').getMonth() === 0;
        if (!isJanuary) {
             if (landlordUnits.size > 1) { // Multi-unit landlord
                if (!processedForOtherCosts.has(t.rentForMonth)) {
                    t.otherCosts = 1000;
                    processedForOtherCosts.add(t.rentForMonth);
                }
            } else { // Single-unit landlord
                t.otherCosts = 1000;
            }
        }
    });

    const groupedByMonth = transactions.reduce((acc, t: DisplayTransaction) => {
        const month = t.rentForMonth;
        if (!acc[month]) {
            acc[month] = [];
        }
        acc[month].push(t);
        return acc;
    }, {} as Record<string, DisplayTransaction[]>);

    const sortedMonths = Object.keys(groupedByMonth).sort();
    let deficitCarryOver = 0;

    sortedMonths.forEach(month => {
        const monthTransactions = groupedByMonth[month];
        
        // Apply deficit from previous month to the first transaction of the current month
        if (deficitCarryOver > 0 && monthTransactions.length > 0) {
            monthTransactions[0].specialDeductions = (monthTransactions[0].specialDeductions || 0) + deficitCarryOver;
        }

        let monthNet = 0;
        // Calculate net for each transaction and sum up for the month
        monthTransactions.forEach((t: DisplayTransaction) => {
            t.netToLandlord = t.gross - t.serviceChargeDeduction - t.managementFee - (t.otherCosts || 0) - (t.specialDeductions || 0);
            monthNet += t.netToLandlord;
        });

        // Determine if there's a deficit to carry to the *next* month
        if (monthNet < 0) {
            deficitCarryOver = Math.abs(monthNet);
        } else {
            deficitCarryOver = 0;
        }
    });
    
    return sortedMonths.flatMap(month => groupedByMonth[month]);
}
