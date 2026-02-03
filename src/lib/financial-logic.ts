import { Tenant, Payment, Unit, LedgerEntry, Property, PropertyOwner, Landlord } from './types';
import { format, isAfter, startOfMonth, addDays, getMonth, getYear, parseISO, isSameMonth, differenceInMonths, addMonths } from 'date-fns';

/**
 * Calculates the total amount due for a tenant in the current billing cycle.
 * First month: Rent + Deposit.
 * Other months: Rent.
 * Service charge is assumed to be included in the rent.
 */
export function calculateTargetDue(tenant: Tenant, date: Date = new Date()): number {
    if (!tenant.lease) {
        return 0;
    }
    const rent = tenant.lease.rent || 0;
    
    // For monthly reconciliation, only charge rent. 
    // Deposit is handled at tenant creation.
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
        // Positive amount = DEBIT (increases due balance)
        // Negative amount = CREDIT (decreases due balance)
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

    // This logic is for normal payments (Rent, Water, etc.)
    const positivePaymentAmount = Math.abs(paymentAmount);
    let totalAvailable = positivePaymentAmount + newAccountBalance; 

    if (totalAvailable >= newDueBalance) {
        totalAvailable -= newDueBalance;
        newDueBalance = 0;
        newAccountBalance = totalAvailable; // Any excess becomes credit
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
 * Monthly reconciliation logic. This function calculates any missed monthly charges
 * and returns the necessary updates for the tenant object. It's designed to be run
 * to bring a tenant's account up-to-date before displaying a balance or processing a new transaction.
 */
export function reconcileMonthlyBilling(tenant: Tenant, unit: Unit | undefined, date: Date = new Date()): { [key: string]: any } {
    if (!tenant.lease || (!tenant.lease.rent && !tenant.lease.serviceCharge)) {
        console.warn(`Skipping billing for tenant ${tenant.name} (${tenant.id}) due to missing lease or charge information.`);
        return {};
    }

    const monthlyCharge = (tenant.residentType === 'Homeowner' && unit?.serviceCharge)
        ? unit.serviceCharge
        : (tenant.lease.rent || 0);

    if (monthlyCharge <= 0) {
        // If there's no monthly charge, just update the status based on current balance
        const updatedStatus = getRecommendedPaymentStatus(tenant, date);
        if (tenant.lease.paymentStatus !== updatedStatus) {
            return { 'lease.paymentStatus': updatedStatus };
        }
        return {};
    }

    // Determine the true start of billing
    let billingStartDate: Date;
    const leaseStartDate = new Date(tenant.lease.startDate);

    if (tenant.residentType === 'Homeowner' && unit?.handoverDate) {
        const handoverDate = new Date(unit.handoverDate);
        const handoverDay = handoverDate.getDate();
        // Handover on/before 10th bills same month, after 10th bills next month.
        billingStartDate = handoverDay <= 10 ? startOfMonth(handoverDate) : startOfMonth(addMonths(handoverDate, 1));
    } else {
        billingStartDate = startOfMonth(leaseStartDate);
    }
    
    const lastBilledDate = tenant.lease.lastBilledPeriod
        ? startOfMonth(new Date(tenant.lease.lastBilledPeriod + '-02')) // Use day 2 to avoid TZ issues
        : null;

    // The first month we should even consider billing for.
    // If they've been billed before, it's the month after that bill.
    // If they've never been billed, it's their billing start date.
    const firstBillableMonth = lastBilledDate ? addMonths(lastBilledDate, 1) : billingStartDate;

    let monthsToBill = 0;
    let latestBilledPeriod = tenant.lease.lastBilledPeriod;
    let loopDate = firstBillableMonth;
    const startOfToday = startOfMonth(date);

    while (loopDate <= startOfToday) {
        monthsToBill++;
        latestBilledPeriod = format(loopDate, 'yyyy-MM');
        loopDate = addMonths(loopDate, 1);
    }
    
    if (monthsToBill === 0) {
        // No new months to bill, but status might need update based on current balance
        const updatedStatus = getRecommendedPaymentStatus(tenant, date);
        if (tenant.lease.paymentStatus !== updatedStatus) {
            return { 'lease.paymentStatus': updatedStatus };
        }
        return {};
    }

    const totalNewCharges = monthsToBill * monthlyCharge;
    let newDueBalance = (tenant.dueBalance || 0) + totalNewCharges;
    let newAccountBalance = tenant.accountBalance || 0;

    // Apply any existing overpayment credit
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
            throw new Error(`Payment amount Ksh ${paymentAmount.toLocaleString()} exceeds the maximum limit of Ksh 1,000,000.`);
        }
    } else { // For adjustments
         if (Math.abs(paymentAmount) > 1000000) {
            throw new Error(`Adjustment amount Ksh ${paymentAmount.toLocaleString()} exceeds the maximum limit of Ksh 1,000,000.`);
        }
         if (paymentAmount === 0) {
             throw new Error(`Adjustment amount cannot be zero.`);
         }
    }


    const today = new Date();
    // Set hours to 0 to compare dates only
    today.setHours(0, 0, 0, 0);
    const paymentDateOnly = new Date(paymentDate);
    paymentDateOnly.setHours(0, 0, 0, 0);

    if (paymentDateOnly > today) {
        throw new Error(`Invalid payment date: ${format(paymentDate, 'yyyy-MM-dd')}. Date cannot be in the future.`);
    }

    if (tenant.residentType === 'Tenant' && tenant.lease?.startDate) {
        const leaseStartDate = new Date(tenant.lease.startDate);
        leaseStartDate.setHours(0, 0, 0, 0);
        if (paymentDateOnly < leaseStartDate) {
            throw new Error(`Invalid payment date: ${format(paymentDate, 'yyyy-MM-dd')}. Date cannot be before the lease start date of ${tenant.lease.startDate}.`);
        }
    }
}

export function generateLedger(
    tenant: Tenant, 
    allTenantPayments: Payment[], 
    properties: Property[],
    owner?: PropertyOwner | Landlord | null
): { ledger: LedgerEntry[], finalDueBalance: number, finalAccountBalance: number } {
    
    let ownerUnits: (Unit & { propertyId: string; propertyName: string; })[] = [];

    if (tenant.residentType === 'Homeowner' && owner) {
        // Find all units belonging to this owner
        ownerUnits = properties.flatMap(p =>
            p.units
              .filter(u => {
                  // Check if the unit is assigned to the owner, works for both Landlord and PropertyOwner
                  if ('assignedUnits' in owner && owner.assignedUnits) { // It's a PropertyOwner
                      return owner.assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name));
                  }
                  if ('bankAccount' in owner) { // It's a Landlord
                      return u.landlordId === owner.id;
                  }
                  return false;
              })
              .map(u => ({ ...u, propertyId: p.id, propertyName: p.name }))
        );
        // De-duplicate units in case of multiple assignment paths
        ownerUnits = [...new Map(ownerUnits.map(item => [`${item.propertyId}-${item.name}`, item])).values()];
    } else {
        // Fallback to single tenant logic if no owner is provided or if it's a regular tenant
        const property = properties.find(p => p.id === tenant.propertyId);
        const unit = property?.units.find(u => u.name === tenant.unitName);
        if (unit && property) {
            ownerUnits = [{ ...unit, propertyId: property.id, propertyName: property.name }];
        }
    }


    // --- GENERATE ALL CHARGES ---
    let allCharges: { id: string, date: Date, description: string, charge: number, payment: number }[] = [];

    // Initial charges (Deposits) - only for Tenants
    if (tenant.residentType === 'Tenant') {
        const leaseStartDate = new Date(tenant.lease.startDate);
        if (tenant.securityDeposit && tenant.securityDeposit > 0) {
            allCharges.push({ id: 'charge-security-deposit', date: leaseStartDate, description: 'Security Deposit', charge: tenant.securityDeposit, payment: 0 });
        }
        if (tenant.waterDeposit && tenant.waterDeposit > 0) {
            allCharges.push({ id: 'charge-water-deposit', date: leaseStartDate, description: 'Water Deposit', charge: tenant.waterDeposit, payment: 0 });
        }
    }

    const monthlyChargesMap = new Map<string, { charge: number; unitNames: string[] }>();

    ownerUnits.forEach(unit => {
        const monthlyCharge = tenant.residentType === 'Homeowner' 
            ? (unit?.serviceCharge || 0) 
            : (tenant.lease.rent || 0);

        if (monthlyCharge > 0) {
            let billingStartDate: Date;

            if (tenant.residentType === 'Homeowner' && unit?.handoverDate) {
                const handoverDate = new Date(unit.handoverDate);
                const handoverDay = handoverDate.getDate();
                // Handover on/before 10th bills same month, after 10th bills next month.
                billingStartDate = handoverDay <= 10 ? startOfMonth(handoverDate) : startOfMonth(addMonths(handoverDate, 1));
            } else {
                billingStartDate = startOfMonth(new Date(tenant.lease.startDate));
            }

            let loopDate = billingStartDate;
            const today = new Date();
            while (loopDate <= today) {
                const monthKey = format(loopDate, 'yyyy-MM');
                if (!monthlyChargesMap.has(monthKey)) {
                    monthlyChargesMap.set(monthKey, { charge: 0, unitNames: [] });
                }
                const entry = monthlyChargesMap.get(monthKey)!;
                entry.charge += monthlyCharge;
                if (!entry.unitNames.includes(unit.name)) {
                    entry.unitNames.push(unit.name);
                }
                loopDate = addMonths(loopDate, 1);
            }
        }
    });

    monthlyChargesMap.forEach((value, key) => {
        const chargeDate = new Date(key + '-01T12:00:00Z'); // Use a consistent time to avoid TZ issues
        const chargeType = tenant.residentType === 'Homeowner' ? 'S.Charge' : 'Rent';
        const unitsCharged = value.unitNames.join(', ');
        const description = `${chargeType} for Units: ${unitsCharged}`;
        allCharges.push({
            id: `charge-${key}`,
            date: chargeDate,
            description: description,
            charge: value.charge,
            payment: 0,
        });
    });

    // --- COMBINE WITH PAYMENTS ---
    const allPaymentsAndAdjustments = allTenantPayments.map(p => {
        const isAdjustment = p.type === 'Adjustment';
        let details = p.notes || `Payment Received`;
        if (p.paymentMethod) {
            details += ` (${p.paymentMethod}${p.transactionId ? `: ${p.transactionId}` : ''})`;
        }

        return {
            id: p.id,
            date: new Date(p.date),
            description: details,
            charge: isAdjustment && p.amount > 0 ? p.amount : 0,
            payment: !isAdjustment ? p.amount : (isAdjustment && p.amount < 0 ? Math.abs(p.amount) : 0),
        };
    });

    const combined = [...allCharges, ...allPaymentsAndAdjustments].sort((a, b) => {
        const dateDiff = a.date.getTime() - b.date.getTime();
        if (dateDiff !== 0) return dateDiff;
        if (a.charge > 0 && b.payment > 0) return -1;
        if (a.payment > 0 && b.charge > 0) return 1;
        return 0;
    });
    
    // --- CALCULATE RUNNING BALANCE ---
    let runningBalance = 0;

    const ledgerWithBalance: LedgerEntry[] = combined.map(item => {
        runningBalance += item.charge;
        runningBalance -= item.payment;
        return { ...item, date: format(item.date, 'yyyy-MM-dd'), balance: runningBalance };
    });
    
    const finalDueBalance = Math.max(0, runningBalance);
    const finalAccountBalance = Math.max(0, -runningBalance);
    
    return {
        ledger: ledgerWithBalance,
        finalDueBalance,
        finalAccountBalance,
    };
}
