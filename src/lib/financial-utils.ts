
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
    // This is the ONLY place where service charge is waived.
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
        // Initial letting month: 50% commission. 
        managementFee = unitRent * 0.50;
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
    // Filter transactions to strictly match the report logic:
    // 1. Show all income rows (gross > 0) that were generated
    // 2. Filter status rows (gross === 0) to stay within the range
    const transactions = allTransactions.filter(t => {
        if (!startDate || !endDate) return true;
        
        const rentMonthDate = parseISO(t.rentForMonth + '-01');
        
        // Hide future months (beyond the current report end date)
        if (isAfter(rentMonthDate, endDate) && !isSameMonth(rentMonthDate, endDate)) return false;

        // For rows with actual income, we allow them even if the rent month is before the range
        if (t.gross > 0) return true;

        // For status rows (Vacant/Unpaid), strictly adhere to the range
        return (isSameMonth(rentMonthDate, startDate) || isAfter(rentMonthDate, startDate)) &&
               (isSameMonth(rentMonthDate, endDate) || isBefore(rentMonthDate, endDate));
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
        summary.totalOtherCosts += 0; // Explicitly zeroed per instruction
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
    const unitMap = new Map<string, Unit & { propertyId: string }>();
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

    // Include payments received in range OR covering months in range
    const filteredPayments = payments.filter(p => {
        if (!startDate || !endDate) return true;
        const paymentDate = parseISO(p.date);
        const inDateRange = isWithinInterval(paymentDate, { start: startDate, end: endDate });
        
        let inMonthRange = false;
        if (p.rentForMonth) {
            const rentMonthDate = parseISO(p.rentForMonth + '-01');
            if (isValid(rentMonthDate)) {
                const s = startOfMonth(startDate);
                const e = startOfMonth(endDate);
                inMonthRange = (isSameMonth(rentMonthDate, s) || isAfter(rentMonthDate, s)) &&
                               (isSameMonth(rentMonthDate, e) || isBefore(rentMonthDate, e));
            }
        }
        
        return inDateRange || inMonthRange;
    });

    let transactions: DisplayTransaction[] = [];
    const sortedPayments = [...filteredPayments].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const tenantMonthTracker = new Map<string, number>();

    sortedPayments.forEach(payment => {
        const tenant = tenantMap.get(payment.tenantId);
        if (!tenant || payment.type !== 'Rent') return;

        const unit = unitMap.get(`${tenant.propertyId}-${tenant.unitName}`);
        const unitRent = unit?.rentAmount || tenant?.lease?.rent || 0;
        
        let remainingAmount = payment.amount;
        if (remainingAmount <= 0 || unitRent <= 0) return;

        let currentMonth: Date;
        if (payment.rentForMonth && isValid(parseISO(payment.rentForMonth + '-01'))) {
            currentMonth = parseISO(payment.rentForMonth + '-01');
        } else {
            let monthIndex = tenantMonthTracker.get(tenant.id) || 0;
            const leaseStartDate = parseISO(tenant.lease.startDate);
            currentMonth = addMonths(leaseStartDate, monthIndex);
        }

        while (remainingAmount >= unitRent) { 
            const rentForThisIteration = unitRent;
            const monthKey = format(currentMonth, 'yyyy-MM');
            
            const virtualPayment: Payment = { ...payment, amount: rentForThisIteration, rentForMonth: monthKey, type: 'Rent' };
            const breakdown = calculateTransactionBreakdown(virtualPayment, unit, tenant);
            
            transactions.push({
                id: `${payment.id}-${currentMonth.getTime()}`,
                date: payment.date,
                propertyId: tenant.propertyId,
                unitName: tenant.unitName,
                unitType: unit?.unitType || 'N/A',
                rentForMonth: monthKey,
                forMonthDisplay: format(currentMonth, 'MMM yyyy'),
                netToLandlord: breakdown.netToLandlord,
                gross: breakdown.gross,
                serviceChargeDeduction: breakdown.serviceChargeDeduction,
                managementFee: breakdown.managementFee,
                otherCosts: 0, 
                occupiedServiceCharge: breakdown.serviceChargeDeduction,
                vacantServiceCharge: 0
            });
            
            remainingAmount -= rentForThisIteration;
            currentMonth = addMonths(currentMonth, 1);
        }
        
        const totalRentExpectedPerMonth = unitRent;
        const totalPaymentsSoFar = sortedPayments
            .filter(p => p.tenantId === tenant.id && p.type === 'Rent' && new Date(p.date) <= new Date(payment.date))
            .reduce((sum, p) => sum + p.amount, 0);
        tenantMonthTracker.set(tenant.id, Math.floor(totalPaymentsSoFar / totalRentExpectedPerMonth));
    });

    const groupedByMonth = transactions.reduce((acc, t: DisplayTransaction) => {
        const month = t.rentForMonth;
        if (!acc[month]) acc[month] = [];
        acc[month].push(t);
        return acc;
    }, {} as Record<string, DisplayTransaction[]>);

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
        const reportedUnitsInMonth = new Set(monthTransactions.map(t => t.unitName));

        landlordUnits.forEach(u => {
            if (reportedUnitsInMonth.has(u.name)) return; 

            let isBillableForServiceCharge = false;
            if (u.handoverStatus === 'Handed Over' && u.serviceCharge && u.serviceCharge > 0 && u.handoverDate) {
                const hDate = parseISO(u.handoverDate);
                if (isValid(hDate)) {
                    const handoverMonthStart = startOfMonth(hDate);
                    const handoverMonthKey = format(handoverMonthStart, 'yyyy-MM');
                    
                    if (handoverMonthKey !== month && (isSameMonth(monthDate, handoverMonthStart) || isAfter(monthDate, handoverMonthStart))) {
                        isBillableForServiceCharge = true;
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

            if (!isOccupiedInMonth && !isBillableForServiceCharge) return;

            const scAmount = isBillableForServiceCharge ? (u.serviceCharge || 0) : 0;
            
            monthTransactions.push({
                id: `status-${month}-${u.name}`,
                date: format(monthDate, 'yyyy-MM-dd'),
                propertyId: u.propertyId,
                unitName: u.name,
                unitType: u.unitType || 'N/A',
                rentForMonth: month,
                forMonthDisplay: format(monthDate, 'MMM yyyy'),
                gross: 0,
                serviceChargeDeduction: scAmount,
                managementFee: 0,
                otherCosts: 0,
                netToLandlord: -scAmount,
                vacantServiceCharge: isOccupiedInMonth ? 0 : scAmount,
                occupiedServiceCharge: isOccupiedInMonth ? scAmount : 0
            });
        });
        
        monthTransactions.sort((a, b) => a.unitName.localeCompare(b.unitName));
    });

    let finalTransactions = allSortedMonths.flatMap(m => groupedByMonth[m]);

    if (startDate && endDate) {
        finalTransactions = finalTransactions.filter(t => {
            const rentMonthDate = parseISO(t.rentForMonth + '-01');
            if (isAfter(rentMonthDate, endDate) && !isSameMonth(rentMonthDate, endDate)) return false;
            if (isBefore(rentMonthDate, startDate) && !isSameMonth(rentMonthDate, startDate)) {
                return t.gross > 0;
            }
            return true;
        });
    }

    finalTransactions.forEach(t => {
        t.otherCosts = 0; 
        t.netToLandlord = t.gross - t.serviceChargeDeduction - t.managementFee;
    });
    
    return finalTransactions;
}
