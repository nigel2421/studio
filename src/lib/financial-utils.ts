'use client';

import { Payment, Property, Tenant, Unit, Landlord, FinancialSummary, DisplayTransaction } from "./types";
import { isSameMonth, parseISO, differenceInMonths, addMonths, format, isWithinInterval, startOfMonth, isBefore, isAfter, isValid } from 'date-fns';

export type { FinancialSummary, DisplayTransaction };

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
    
    // Default to the full service charge amount
    let serviceChargeDeduction = serviceCharge;
    
    // POLICY: Waive service charge for the month of handover (e.g. Dec handover -> Dec SC 0)
    if (unit?.handoverDate && payment.rentForMonth) {
        const hMonth = format(parseISO(unit.handoverDate), 'yyyy-MM');
        if (hMonth === payment.rentForMonth) {
            serviceChargeDeduction = 0;
        }
    }
    
    let managementFee = 0;
    const standardManagementFeeRate = 0.05;

    const isRentedForClients = unit?.managementStatus === 'Rented for Clients';
    const isFirstMonthOfLease = tenant?.lease?.startDate && payment.rentForMonth && isSameMonth(parseISO(tenant.lease.startDate), parseISO(`${payment.rentForMonth}-01`));

    let isInitialLettingAfterHandover = false;
    if (isRentedForClients && isFirstMonthOfLease && unit?.handoverDate && tenant?.lease?.startDate) {
        try {
            const handoverDate = parseISO(unit.handoverDate);
            const leaseStartDate = parseISO(tenant.lease.startDate);
            // If leased within 3 months of handover, it's considered an initial letting
            if (differenceInMonths(leaseStartDate, handoverDate) < 3) {
                isInitialLettingAfterHandover = true;
            }
        } catch (e) {
            // ignore parsing errors
        }
    }

    if (isRentedForClients && isFirstMonthOfLease && isInitialLettingAfterHandover) {
        // Initial letting month: 50% commission and waived service charge deduction
        managementFee = unitRent * 0.50;
        serviceChargeDeduction = 0;
    } else {
        // Standard processing for subsequent months or non-initial lettings
        if (unitRent > 0 && payment.type === 'Rent') {
            const rentRatio = Math.min(1, grossAmount / unitRent); 
            managementFee = (unitRent * standardManagementFeeRate) * rentRatio;
            
            // Apply service charge deduction pro-rated to the amount of rent paid
            serviceChargeDeduction = serviceChargeDeduction * rentRatio;
        } else {
            // No fees or deductions for non-rent types (deposits, etc)
            managementFee = 0;
            serviceChargeDeduction = 0;
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
    allTransactions: DisplayTransaction[],
    properties: Property[], 
    tenants: Tenant[],
    startDate?: Date, 
    endDate?: Date, 
    landlord?: Landlord | null
): FinancialSummary {
    // Filter transactions to strictly match the report period
    const transactions = allTransactions.filter(t => {
        if (!startDate || !endDate) return true;
        try {
            const rentMonthDate = parseISO(t.rentForMonth + '-01');
            return (isSameMonth(rentMonthDate, startDate) || isAfter(rentMonthDate, startDate)) &&
                   (isSameMonth(rentMonthDate, endDate) || isBefore(rentMonthDate, endDate));
        } catch(e) {
            return false;
        }
    });

    const summary: FinancialSummary = {
        totalRent: 0,
        totalManagementFees: 0,
        totalServiceCharges: 0,
        totalOtherCosts: 0,
        totalNetRemittance: 0,
        transactionCount: transactions.length,
        vacantUnitServiceChargeDeduction: 0,
    };
    
    transactions.forEach((transaction: DisplayTransaction) => {
        summary.totalRent += transaction.gross;
        summary.totalServiceCharges += transaction.occupiedServiceCharge || 0;
        summary.vacantUnitServiceChargeDeduction += transaction.vacantServiceCharge || 0;
        summary.totalManagementFees += transaction.managementFee;
        summary.totalOtherCosts += transaction.otherCosts || 0;
        summary.totalNetRemittance += transaction.netToLandlord;
    });

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
    const landlordUnits = new Map<string, Unit & { propertyId: string }>();
    properties.forEach(p => {
        (p.units || []).forEach(u => {
            const unitWithProp = { ...u, propertyId: p.id };
            unitMap.set(`${p.id}-${u.name}`, unitWithProp);
            if (u.landlordId === landlordId || (landlordId === 'soil_merchants_internal' && u.ownership === 'SM')) {
                landlordUnits.set(`${p.id}-${u.name}`, unitWithProp);
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

    // Group payments by tenant to track months paid
    const tenantMonthTracker = new Map<string, number>();

    sortedPayments.forEach(payment => {
        const tenant = tenantMap.get(payment.tenantId);
        if (!tenant || payment.type !== 'Rent') return;

        const unit = unitMap.get(`${tenant.propertyId}-${tenant.unitName}`);
        const unitRent = unit?.rentAmount || tenant?.lease?.rent || 0;
        
        let remainingAmount = payment.amount;
        if (remainingAmount <= 0 || unitRent <= 0) return;

        let monthIndex = tenantMonthTracker.get(tenant.id) || 0;
        const leaseStartDate = parseISO(tenant.lease.startDate);

        while (remainingAmount >= unitRent && monthIndex < 24) { 
            const rentForThisIteration = unitRent;
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
                netToLandlord: breakdown.netToLandlord,
                gross: breakdown.gross,
                serviceChargeDeduction: breakdown.serviceChargeDeduction,
                managementFee: breakdown.managementFee,
                otherCosts: 0,
            });
            
            remainingAmount -= rentForThisIteration;
            monthIndex++;
        }
        tenantMonthTracker.set(tenant.id, monthIndex);
    });

    // Group by month to inject vacant service charges
    const groupedByMonth = transactions.reduce((acc, t: DisplayTransaction) => {
        const month = t.rentForMonth;
        if (!acc[month]) acc[month] = [];
        acc[month].push(t);
        return acc;
    }, {} as Record<string, DisplayTransaction[]>);

    // If a range is provided, ensure all months in range are present even if no rent paid
    if (startDate && endDate) {
        let loopDate = startOfMonth(startDate);
        const endLoop = startOfMonth(endDate);
        while (isBefore(loopDate, endLoop) || isSameMonth(loopDate, endLoop)) {
            const mKey = format(loopDate, 'yyyy-MM');
            if (!groupedByMonth[mKey]) groupedByMonth[mKey] = [];
            loopDate = addMonths(loopDate, 1);
        }
    }

    const allSortedMonths = Object.keys(groupedByMonth).sort();

    allSortedMonths.forEach(month => {
        const monthDate = parseISO(month + '-01');
        const monthTransactions = groupedByMonth[month];
        
        let monthlyVacantSC = 0;
        landlordUnits.forEach(u => {
            let isBillableInMonth = false;
            if (u.handoverStatus === 'Handed Over' && u.serviceCharge && u.serviceCharge > 0 && u.handoverDate) {
                const hDate = parseISO(u.handoverDate);
                if (isValid(hDate)) {
                    const handoverMonthStart = startOfMonth(hDate);
                    const handoverMonthKey = format(handoverMonthStart, 'yyyy-MM');
                    
                    // POLICY: Waive service charge for the month of handover
                    if (handoverMonthKey !== month && (isSameMonth(monthDate, handoverMonthStart) || isAfter(monthDate, handoverMonthStart))) {
                        isBillableInMonth = true;
                    }
                }
            }

            const tenant = tenants.find(t => t.unitName === u.name && t.propertyId === u.propertyId);
            let isOccupiedInMonth = false;
            if (tenant && tenant.lease?.startDate) {
                const leaseStart = startOfMonth(parseISO(tenant.lease.startDate));
                if (isSameMonth(monthDate, leaseStart) || isAfter(monthDate, leaseStart)) {
                    isOccupiedInMonth = true;
                }
            }

            if (!isOccupiedInMonth && isBillableInMonth) {
                monthlyVacantSC += u.serviceCharge!;
            }
        });

        if (monthTransactions.length > 0) {
            // Consolidate vacant SC into the first transaction of the month for transparency
            monthTransactions[0].vacantServiceCharge = monthlyVacantSC;
            monthTransactions[0].serviceChargeDeduction += monthlyVacantSC;
            
            monthTransactions.forEach((t, idx) => {
                t.occupiedServiceCharge = (idx === 0) ? (t.serviceChargeDeduction - monthlyVacantSC) : t.serviceChargeDeduction;
                t.netToLandlord = t.gross - t.serviceChargeDeduction - t.managementFee - (t.otherCosts || 0);
            });
        } else if (monthlyVacantSC > 0) {
            // Inject row for months with ONLY vacant service charges
            monthTransactions.push({
                id: `vacant-${month}`,
                date: format(monthDate, 'yyyy-MM-dd'),
                propertyId: landlordUnits.values().next().value?.propertyId || '',
                unitName: 'Vacant Units',
                unitType: 'N/A',
                rentForMonth: month,
                forMonthDisplay: format(monthDate, 'MMM yyyy'),
                gross: 0,
                serviceChargeDeduction: monthlyVacantSC,
                managementFee: 0,
                otherCosts: 0,
                netToLandlord: -monthlyVacantSC,
                vacantServiceCharge: monthlyVacantSC,
                occupiedServiceCharge: 0
            });
        }
    });

    let finalTransactions = allSortedMonths.flatMap(m => groupedByMonth[m]);

    // Apply strict period filtering one last time to ensure no March rows if report ends in Feb
    if (startDate && endDate) {
        finalTransactions = finalTransactions.filter(t => {
            const rentMonthDate = parseISO(t.rentForMonth + '-01');
            return (isSameMonth(rentMonthDate, startDate) || isAfter(rentMonthDate, startDate)) &&
                   (isSameMonth(rentMonthDate, endDate) || isBefore(rentMonthDate, endDate));
        });
    }

    // Apply otherCosts (KSh 1,000 transaction fee) once per month from Feb 2026 onwards
    const processedForOtherCosts = new Set<string>();
    const policyStartDate = parseISO('2026-02-01');

    finalTransactions.forEach(t => {
        const rentMonthDate = parseISO(t.rentForMonth + '-01');
        if (isBefore(rentMonthDate, policyStartDate)) {
            t.otherCosts = 0;
        } else {
            if (landlordUnits.size > 1) {
                if (!processedForOtherCosts.has(t.rentForMonth)) {
                    t.otherCosts = 1000;
                    processedForOtherCosts.add(t.rentForMonth);
                } else {
                    t.otherCosts = 0;
                }
            } else {
                t.otherCosts = 1000;
            }
        }
        // Recalculate net after costs
        t.netToLandlord = t.gross - t.serviceChargeDeduction - t.managementFee - (t.otherCosts || 0);
    });
    
    return finalTransactions;
}
