import { Payment, Property, Tenant, Unit, Landlord } from "./types";
import { isSameMonth, parseISO, differenceInMonths, addMonths, format, isWithinInterval, startOfMonth, isBefore, isAfter } from 'date-fns';

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
    
    const isEracovManaged = unit?.managementStatus === 'Rented for Clients' || unit?.managementStatus === 'Rented for Soil Merchants' || unit?.managementStatus === 'Airbnb';
    const otherCosts = isEracovManaged && payment.type === 'Rent' && grossAmount > 0 ? 1000 : 0;

    const netToLandlord = grossAmount - serviceChargeDeduction - managementFee; // Other costs will be subtracted later

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
    totalSpecialDeductions: number;
    totalNetRemittance: number;
    transactionCount: number;
    vacantUnitServiceChargeDeduction?: number;
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
        const transactionDate = parseISO(t.date);
        return isWithinInterval(transactionDate, { start: startDate, end: endDate });
    });

    const summary: FinancialSummary = {
        totalRent: 0,
        totalManagementFees: 0,
        totalServiceCharges: 0,
        totalOtherCosts: 0,
        totalSpecialDeductions: 0,
        totalNetRemittance: 0,
        transactionCount: transactions.length,
        vacantUnitServiceChargeDeduction: 0,
    };
    
    transactions.forEach(transaction => {
        summary.totalRent += transaction.gross;
        summary.totalServiceCharges += transaction.serviceChargeDeduction;
        summary.totalManagementFees += transaction.managementFee;
        summary.totalOtherCosts += transaction.otherCosts || 0;
        summary.totalSpecialDeductions += transaction.specialDeductions || 0;
        summary.totalNetRemittance += transaction.netToLandlord;
    });

    let vacantUnitDeduction = 0;
    if (startDate && endDate && landlord) {
        const start = startOfMonth(startDate);
        const end = startOfMonth(endDate);
        
        const landlordUnits = properties.flatMap(p => 
            (p.units || []).filter(u => u.landlordId === landlord.id || (landlord.id === 'soil_merchants_internal' && u.ownership === 'SM'))
            .map(u => ({...u, propertyId: p.id }))
        );
        
        let loopDate = start;
        while(isBefore(loopDate, end) || isSameMonth(loopDate, end)) {
            landlordUnits.forEach(u => {
                if (!u.propertyId) return;

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
) {
    const landlordId = landlord?.id;
    const unitMap = new Map<string, Unit>();
    properties.forEach(p => {
        (p.units || []).forEach(u => {
            unitMap.set(`${p.id}-${u.name}`, { ...u, propertyId: p.id });
        });
    });

    const tenantMap = new Map(tenants.map(t => [t.id, t]));

    const filteredPayments = payments.filter(p => {
        if (!startDate || !endDate) return true;
        const paymentDate = parseISO(p.date);
        return isWithinInterval(paymentDate, { start: startDate, end: endDate });
    });

    const transactions: any[] = [];
    
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

        while (remainingAmount > 0 && monthIndex < 24) { // Add a safeguard limit
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
                ...breakdown,
                specialDeductions: 0,
                gross: rentForThisIteration,
            });
            
            remainingAmount -= rentForThisIteration;
            monthIndex++;
        }
    });
    
    // --- Special Deductions Logic ---
    const deductedStageTwoUnits = new Set<string>();
    const deductedStageThreeUnits = new Set<string>();

    if (landlord?.deductStageTwoCost) {
        transactions.forEach(t => {
            if (!deductedStageTwoUnits.has(t.unitName)) {
                t.specialDeductions = (t.specialDeductions || 0) + 10000;
                deductedStageTwoUnits.add(t.unitName);
            }
        });
    }

    if (landlord?.deductStageThreeCost) {
        transactions.forEach(t => {
            const unit = unitMap.get(`${t.propertyId}-${t.unitName}`);
            if (unit && !deductedStageThreeUnits.has(t.unitName)) {
                let cost = 0;
                switch (unit.unitType) {
                    case 'Studio': cost = 8000; break;
                    case 'One Bedroom': cost = 12000; break;
                    case 'Two Bedroom': cost = 16000; break;
                }
                if (cost > 0) {
                    t.specialDeductions = (t.specialDeductions || 0) + cost;
                    deductedStageThreeUnits.add(t.unitName);
                }
            }
        });
    }

    // --- Transaction Fee Logic ---
    let landlordUnitCount = 0;
    if (landlordId) {
        const landlordOwnedUnits = new Set<string>();
        properties.forEach(p => {
            (p.units || []).forEach(u => {
                if(u.landlordId === landlordId || (landlordId === 'soil_merchants_internal' && u.ownership === 'SM')) {
                    landlordOwnedUnits.add(`${p.id}-${u.name}`);
                }
            });
        });
        landlordUnitCount = landlordOwnedUnits.size;
    }
    
    if (landlordUnitCount > 1) {
        const processedMonths = new Set<string>();
        transactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .forEach(t => {
                const monthKey = t.rentForMonth;
                if (processedMonths.has(monthKey)) {
                    if (t.otherCosts >= 1000) { 
                        t.otherCosts = 0; 
                    }
                } else {
                    if (t.otherCosts >= 1000) {
                       processedMonths.add(monthKey);
                    }
                }
            });
    }
    
    transactions.forEach(t => {
        t.netToLandlord = t.gross - t.serviceChargeDeduction - t.managementFee - t.otherCosts - t.specialDeductions;
    });
    
    return transactions;
}
