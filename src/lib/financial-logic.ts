import { Tenant, Payment, Unit, LedgerEntry, Property, PropertyOwner, Landlord, WaterMeterReading } from './types';
import { format, isAfter, startOfMonth, addDays, getMonth, getYear, parseISO, isSameMonth, differenceInMonths, addMonths, isBefore, isValid } from 'date-fns';

/**
 * Robust date parsing utility to handle various date string formats.
 */
function safeParseDate(dateStr: string | undefined): Date {
    if (!dateStr) return new Date();
    // Standard Date constructor is quite robust for basic formats
    const d = new Date(dateStr);
    if (isValid(d)) return d;
    // Fallback to parseISO for strict ISO formats
    const isoD = parseISO(dateStr);
    if (isValid(isoD)) return isoD;
    // Last resort default
    return new Date();
}

/**
 * Calculates the total amount due for a tenant in the current billing cycle.
 */
export function calculateTargetDue(tenant: Tenant, date: Date = new Date()): number {
    if (!tenant.lease) {
        return 0;
    }
    const rent = tenant.lease.rent || 0;
    return rent;
}

/**
 * Determines if the payment status should be marked as Pending/Overdue
 * based on the 5th of the month rule.
 */
export function getRecommendedPaymentStatus(tenant: { dueBalance?: number }, date: Date = new Date()): Tenant['lease']['paymentStatus'] {
    const dueDay = 5;
    const currentDay = date.getDate();

    if ((tenant.dueBalance || 0) <= 0) {
        return 'Paid';
    }

    if (currentDay > dueDay) {
        return 'Overdue';
    }

    return 'Pending';
}

/**
 * Process a new payment and update the tenant's balances.
 */
export function processPayment(tenant: Tenant, paymentAmount: number, paymentType: Payment['type'], paymentDate: Date = new Date()): { [key: string]: any } {
    let newDueBalance = tenant.dueBalance || 0;
    let newAccountBalance = tenant.accountBalance || 0;

    if (paymentType === 'Adjustment') {
        newDueBalance += paymentAmount;
        if (newDueBalance < 0) {
            newAccountBalance += Math.abs(newDueBalance);
            newDueBalance = 0;
        }
        return {
            dueBalance: newDueBalance,
            accountBalance: newAccountBalance,
            'lease.paymentStatus': getRecommendedPaymentStatus({ dueBalance: newDueBalance }, paymentDate),
        };
    }

    const positivePaymentAmount = Math.abs(paymentAmount);
    let totalAvailable = positivePaymentAmount + newAccountBalance; 

    if (totalAvailable >= newDueBalance) {
        totalAvailable -= newDueBalance;
        newDueBalance = 0;
        newAccountBalance = totalAvailable;
    } else {
        newDueBalance -= totalAvailable;
        newAccountBalance = 0;
    }

    return {
        dueBalance: newDueBalance,
        accountBalance: newAccountBalance,
        'lease.paymentStatus': getRecommendedPaymentStatus({ dueBalance: newDueBalance }, paymentDate),
        'lease.lastPaymentDate': format(paymentDate, 'yyyy-MM-dd')
    };
}

/**
 * Monthly reconciliation logic. Strictly handles Rent/Service Charges.
 */
export function reconcileMonthlyBilling(tenant: Tenant, unit: Unit | undefined, date: Date = new Date()): { [key: string]: any } {
    if (!tenant.lease || (!tenant.lease.rent && !tenant.lease.serviceCharge)) {
        return {};
    }

    const monthlyCharge = (tenant.residentType === 'Homeowner' && unit?.serviceCharge)
        ? unit.serviceCharge
        : (tenant.lease.rent || 0);

    if (monthlyCharge <= 0) {
        const updatedStatus = getRecommendedPaymentStatus(tenant, date);
        if (tenant.lease.paymentStatus !== updatedStatus) {
            return { 'lease.paymentStatus': updatedStatus };
        }
        return {};
    }

    let billingStartDate: Date;
    const leaseStartDateStr = tenant.lease.startDate;
    const leaseStartDate = safeParseDate(leaseStartDateStr);

    if (tenant.residentType === 'Homeowner' && unit?.handoverDate) {
        const handoverDate = safeParseDate(unit.handoverDate);
        const handoverDay = handoverDate.getDate();
        if (handoverDay <= 10) {
            billingStartDate = startOfMonth(addMonths(handoverDate, 1));
        } else {
            billingStartDate = startOfMonth(addMonths(handoverDate, 2));
        }
    } else {
        billingStartDate = startOfMonth(leaseStartDate);
    }
    
    const lastBilledDate = tenant.lease.lastBilledPeriod && !/NaN/.test(tenant.lease.lastBilledPeriod)
        ? startOfMonth(parseISO(tenant.lease.lastBilledPeriod + '-02'))
        : addMonths(billingStartDate, -1);

    const firstBillableMonth = lastBilledDate && isValid(lastBilledDate) ? addMonths(lastBilledDate, 1) : billingStartDate;

    let monthsToBill = 0;
    let latestBilledPeriod = tenant.lease.lastBilledPeriod;
    let loopDate = firstBillableMonth;
    const startOfToday = startOfMonth(date);

    if (isValid(loopDate)) {
        while (isBefore(loopDate, startOfToday) || isSameMonth(loopDate, startOfToday)) { 
            monthsToBill++;
            latestBilledPeriod = format(loopDate, 'yyyy-MM');
            loopDate = addMonths(loopDate, 1);
        }
    }
    
    if (monthsToBill === 0) {
        const updatedStatus = getRecommendedPaymentStatus(tenant, date);
        if (tenant.lease.paymentStatus !== updatedStatus) {
            return { 'lease.paymentStatus': updatedStatus };
        }
        return {};
    }

    const totalNewCharges = monthsToBill * monthlyCharge;
    let newDueBalance = (tenant.dueBalance || 0) + totalNewCharges;
    let newAccountBalance = tenant.accountBalance || 0;

    if (newAccountBalance > 0) {
        if (newAccountBalance >= newDueBalance) {
            newAccountBalance -= newDueBalance;
            newDueBalance = 0;
        } else {
            newDueBalance -= newAccountBalance;
            newAccountBalance = 0;
        }
    }

    return {
        dueBalance: newDueBalance,
        accountBalance: newAccountBalance,
        'lease.paymentStatus': getRecommendedPaymentStatus({ dueBalance: newDueBalance }, date),
        'lease.lastBilledPeriod': latestBilledPeriod,
    };
}

export function validatePayment(
    paymentAmount: number,
    paymentDate: Date,
    tenant: Tenant,
    paymentType: Payment['type']
): void {
    if (paymentType !== 'Adjustment') {
        if (paymentAmount <= 0) {
            throw new Error(`Invalid payment amount: Ksh ${paymentAmount}. Amount must be positive.`);
        }
        if (paymentAmount > 1000000) {
            throw new Error(`Payment amount Ksh ${paymentAmount.toLocaleString()} exceeds the maximum limit.`);
        }
    } else {
         if (Math.abs(paymentAmount) > 1000000) {
            throw new Error(`Adjustment amount Ksh ${paymentAmount.toLocaleString()} exceeds the maximum limit.`);
        }
         if (paymentAmount === 0) {
             throw new Error(`Adjustment amount cannot be zero.`);
         }
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const paymentDateOnly = new Date(paymentDate);
    paymentDateOnly.setHours(0, 0, 0, 0);

    if (paymentDateOnly > today) {
        throw new Error(`Invalid payment date: ${format(paymentDate, 'yyyy-MM-dd')}. Date cannot be in the future.`);
    }
}

export function generateLedger(
    tenant: Tenant,
    allTenantPayments: Payment[],
    properties: Property[],
    allTenantWaterReadings: WaterMeterReading[],
    owner?: PropertyOwner | Landlord | null,
    asOfDate: Date = new Date(),
    options: { includeRent?: boolean, includeServiceCharge?: boolean, includeWater?: boolean } = {}
): { ledger: LedgerEntry[], finalDueBalance: number, finalAccountBalance: number } {
    const finalOptions = { includeRent: true, includeServiceCharge: true, includeWater: true, ...options };

    let ownerUnits: (Unit & { propertyId: string; propertyName: string; })[] = [];

    if (tenant.residentType === 'Homeowner' && owner) {
        ownerUnits = properties.flatMap(p =>
            p.units
                .filter(u => 'assignedUnits' in owner ? (owner as PropertyOwner).assignedUnits.some((au: { propertyId: string; unitNames: string[]; }) => au.propertyId === p.id && au.unitNames.includes(u.name)) : u.landlordId === owner.id)
                .map(u => ({ ...u, propertyId: p.id, propertyName: p.name }))
        );
        ownerUnits = [...new Map(ownerUnits.map(item => [`${item.propertyId}-${item.name}`, item])).values()];
    } else {
        // Robust unit matching: trim whitespace and use case-insensitive matching
        const targetUnitName = tenant.unitName?.trim().toLowerCase();
        const property = properties.find(p => p.id === tenant.propertyId);
        const unit = property?.units.find(u => u.name.trim().toLowerCase() === targetUnitName);
        
        if (unit && property) {
            ownerUnits = [{ ...unit, propertyId: property.id, propertyName: property.name }];
        } else if (tenant.unitName) {
            // FALLBACK: Use lease data to generate charges even if unit is missing from property list
            ownerUnits = [{ 
                name: tenant.unitName, 
                status: 'rented', 
                ownership: 'Landlord', 
                unitType: 'Studio', 
                rentAmount: tenant.lease.rent,
                serviceCharge: tenant.lease.serviceCharge || 0,
                propertyId: tenant.propertyId, 
                propertyName: 'Assigned Property' 
            }];
        }
    }

    let allCharges: { id: string, date: Date, description: string, charge: number, payment: number, forMonth?: string, priorReading?: number, currentReading?: number, consumption?: number, rate?: number, unitName?: string }[] = [];

    const leaseStartDate = safeParseDate(tenant.lease.startDate);

    if (tenant.residentType === 'Tenant' && finalOptions.includeRent) {
        if (tenant.securityDeposit && tenant.securityDeposit > 0) {
            allCharges.push({ id: 'charge-security-deposit', date: leaseStartDate, description: 'Security Deposit', charge: tenant.securityDeposit, payment: 0, forMonth: format(leaseStartDate, 'MMM yyyy') });
        }
        if (tenant.waterDeposit && tenant.waterDeposit > 0) {
            allCharges.push({ id: 'charge-water-deposit', date: leaseStartDate, description: 'Water Deposit', charge: tenant.waterDeposit, payment: 0, forMonth: format(leaseStartDate, 'MMM yyyy') });
        }
    }

    const monthlyChargesMap = new Map<string, { charge: number; unitNames: string[], type: 'Rent' | 'Service Charge' }>();

    ownerUnits.forEach(unit => {
        const isHomeowner = tenant.residentType === 'Homeowner';
        const chargeType = isHomeowner ? 'Service Charge' : 'Rent';
        
        if ((chargeType === 'Rent' && !finalOptions.includeRent) || (chargeType === 'Service Charge' && !finalOptions.includeServiceCharge)) {
            return;
        }

        const monthlyCharge = isHomeowner ? (unit?.serviceCharge || 0) : (tenant.lease.rent || 0);

        if (monthlyCharge > 0) {
            let unitBillingStart: Date;
            if (isHomeowner && unit?.handoverDate) {
                const handoverDate = safeParseDate(unit.handoverDate);
                const handoverDay = handoverDate.getDate();
                unitBillingStart = handoverDay <= 10
                    ? startOfMonth(addMonths(handoverDate, 1))
                    : startOfMonth(addMonths(handoverDate, 2));
            } else {
                unitBillingStart = startOfMonth(leaseStartDate);
            }
            
            let loopDate = unitBillingStart;
            const endOfPeriod = startOfMonth(asOfDate); 

            if (isValid(loopDate)) {
                // Loop through every month from start to current period
                while (isBefore(loopDate, endOfPeriod) || isSameMonth(loopDate, endOfPeriod)) {
                    const monthKey = format(loopDate, 'yyyy-MM');
                    if (!monthlyChargesMap.has(monthKey)) {
                        monthlyChargesMap.set(monthKey, { charge: 0, unitNames: [], type: chargeType });
                    }
                    const entry = monthlyChargesMap.get(monthKey)!;
                    entry.charge += monthlyCharge;
                    if (!entry.unitNames.includes(unit.name)) entry.unitNames.push(unit.name);
                    loopDate = addMonths(loopDate, 1);
                }
            }
        }
    });

    monthlyChargesMap.forEach((value, key) => {
        const chargeDate = parseISO(key + '-01');
        const unitText = value.unitNames.length > 1 ? 'Units' : 'Unit';
        const description = `${value.type} for ${unitText}: ${value.unitNames.join(', ')}`;
        allCharges.push({ id: `charge-${key}`, date: chargeDate, description, charge: value.charge, payment: 0, forMonth: format(chargeDate, 'MMM yyyy') });
    });

    if (finalOptions.includeWater && allTenantWaterReadings) {
      allTenantWaterReadings.forEach(reading => {
          allCharges.push({ id: `charge-water-${reading.id}`, date: safeParseDate(reading.date), description: `Water Bill for ${reading.unitName}`, charge: reading.amount, payment: 0, forMonth: format(safeParseDate(reading.date), 'MMM yyyy'), priorReading: reading.priorReading, currentReading: reading.currentReading, consumption: reading.consumption, rate: reading.rate, unitName: reading.unitName });
      });
    }

    const paymentsToInclude = allTenantPayments.filter(p => {
        if (p.type === 'WaterDeposit' || p.type === 'Rent' || p.type === 'Deposit') return !!finalOptions.includeRent || !!finalOptions.includeWater;
        if (p.type === 'ServiceCharge') return !!finalOptions.includeServiceCharge;
        return (p.type === 'Adjustment' || p.type === 'Reversal') && !finalOptions.includeWater;
    });

    const allPaymentsAndAdjustments = paymentsToInclude.map(p => {
        const isAdjustment = p.type === 'Adjustment';
        const typeLabel = p.type === 'Rent' ? 'Payment' : `${p.type.replace(/([A-Z])/g, ' $1').trim()} Payment`;
        let details = p.notes || `${typeLabel} Received`;
        if (p.paymentMethod) details += ` (${p.paymentMethod}${p.transactionId ? `: ${p.transactionId}` : ''})`;
        return { id: p.id, date: safeParseDate(p.date), description: details, charge: isAdjustment && p.amount > 0 ? p.amount : 0, payment: !isAdjustment ? p.amount : (isAdjustment && p.amount < 0 ? Math.abs(p.amount) : 0), forMonth: p.rentForMonth ? format(parseISO(p.rentForMonth + '-02'), 'MMM yyyy') : undefined, status: p.status };
    });

    const combined = [...allCharges, ...allPaymentsAndAdjustments].sort((a, b) => {
        const timeA = a.date.getTime();
        const timeB = b.date.getTime();
        if (timeA !== timeB) return timeA - timeB;
        // If same day, put charges before payments
        if (a.charge > 0 && b.payment > 0) return -1;
        if (a.payment > 0 && b.charge > 0) return 1;
        return 0;
    });

    let runningBalance = 0;
    const ledgerWithBalance: LedgerEntry[] = combined.map(item => {
        runningBalance += item.charge;
        runningBalance -= item.payment;
        return { ...item, date: format(item.date, 'yyyy-MM-dd'), balance: runningBalance, forMonth: item.forMonth, status: (item as any).status };
    });

    return { ledger: ledgerWithBalance, finalDueBalance: Math.max(0, runningBalance), finalAccountBalance: Math.max(0, -runningBalance) };
}
