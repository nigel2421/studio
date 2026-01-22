
import { Tenant, Payment } from './types';
import { format, isAfter, startOfMonth, addDays, getMonth, getYear, parseISO, isSameMonth } from 'date-fns';

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
export function processPayment(tenant: Tenant, paymentAmount: number): { [key: string]: any } {
    let newDueBalance = tenant.dueBalance || 0;
    let newAccountBalance = tenant.accountBalance || 0;

    // Total available = payment + existing overpayment
    let totalAvailable = paymentAmount + newAccountBalance;
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
 * Monthly reconciliation logic (should run on the 1st or when dashboard loads)
 * This adds the monthly rent to the dueBalance.
 */
export function reconcileMonthlyBilling(tenant: Tenant, date: Date = new Date()): { [key: string]: any } {
    if (!tenant.lease) {
        console.warn(`Skipping billing for tenant ${tenant.name} (${tenant.id}) due to missing lease information.`);
        return {};
    }

    // --- DATA CORRECTION ---
    // This is a data-fix for tenants who might have been created with a zero balance.
    const hasMadeNoPayments = !tenant.lease.lastPaymentDate;
    const hasZeroBalance = (tenant.dueBalance || 0) === 0 && (tenant.accountBalance || 0) === 0;
    const initialCharges = (tenant.lease.rent || 0) + (tenant.securityDeposit || 0) + (tenant.waterDeposit || 0);

    if (hasMadeNoPayments && hasZeroBalance && initialCharges > 0) {
        const correctInitialDue = (tenant.lease.rent || 0) + (tenant.securityDeposit || 0) + (tenant.waterDeposit || 0);
        return { dueBalance: correctInitialDue, 'lease.paymentStatus': 'Pending' };
    }
    // --- END DATA CORRECTION ---

    const currentPeriod = format(date, 'yyyy-MM');

    // If we've already billed for this period, just update the status if needed and exit.
    if (tenant.lease.lastBilledPeriod === currentPeriod) {
        const updatedStatus = getRecommendedPaymentStatus(tenant, date);
        if (tenant.lease.paymentStatus !== updatedStatus) {
            return { 'lease.paymentStatus': updatedStatus };
        }
        return {}; // No changes needed
    }

    const monthlyCharge = (tenant.lease.rent || 0);
    let newDueBalance = (tenant.dueBalance || 0) + monthlyCharge;
    let newAccountBalance = tenant.accountBalance || 0;

    // Apply overpayment credit if any
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
        'lease.lastBilledPeriod': currentPeriod,
    };
}
