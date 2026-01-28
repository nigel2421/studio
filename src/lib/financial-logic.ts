
import { Tenant, Payment, Unit, LedgerEntry } from './types';
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
export function getRecommendedPaymentStatus(tenant: Tenant, date: Date = new Date()): Tenant['lease']['paymentStatus'] {
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
export function processPayment(tenant: Tenant, paymentAmount: number, paymentType: Payment['type']): { [key: string]: any } {
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
            'lease.paymentStatus': getRecommendedPaymentStatus({ ...tenant, dueBalance: newDueBalance }),
        };
    }

    // This logic is for normal payments (Rent, Water, etc.)
    const positivePaymentAmount = Math.abs(paymentAmount);
    let totalAvailable = positivePaymentAmount + newAccountBalance;
    newAccountBalance = 0; // Reset as we are using it

    if (totalAvailable >= newDueBalance) {
        totalAvailable -= newDueBalance;
        newDueBalance = 0;
        newAccountBalance = totalAvailable; // Remaining goes to overpayment
    } else {
        newDueBalance -= totalAvailable;
        totalAvailable = 0;
    }

    return {
        dueBalance: newDueBalance,
        accountBalance: newAccountBalance,
        'lease.paymentStatus': newDueBalance <= 0 ? 'Paid' : 'Pending',
        'lease.lastPaymentDate': format(new Date(), 'yyyy-MM-dd')
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
        // For homeowners, billing starts the month *after* handover.
        billingStartDate = startOfMonth(addMonths(new Date(unit.handoverDate), 1));
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
        'lease.paymentStatus': getRecommendedPaymentStatus({ ...tenant, dueBalance: newDueBalance }, date),
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

    // This validation should only apply to tenants, not homeowners whose billing is tied to handover.
    if (tenant.residentType === 'Tenant' && tenant.lease?.startDate) {
        const leaseStartDate = new Date(tenant.lease.startDate);
        leaseStartDate.setHours(0, 0, 0, 0);
        if (paymentDateOnly < leaseStartDate) {
            throw new Error(`Invalid payment date: ${format(paymentDate, 'yyyy-MM-dd')}. Date cannot be before the lease start date of ${tenant.lease.startDate}.`);
        }
    }
}
