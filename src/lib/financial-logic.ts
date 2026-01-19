
import { Tenant, Payment } from './types';
import { format, isAfter, startOfMonth, addDays, getMonth, getYear, parseISO, isSameMonth } from 'date-fns';

/**
 * Calculates the total amount due for a tenant in the current billing cycle.
 * First month: Rent + Deposit (assumed same as rent) + Service Charge.
 * Other months: Rent + Service Charge.
 */
export function calculateTargetDue(tenant: Tenant, date: Date = new Date()): number {
    if (!tenant.lease) {
        return 0;
    }
    const rent = tenant.lease.rent || 0;
    const serviceCharge = tenant.lease.serviceCharge || 0;
    
    if (!tenant.lease.startDate) {
        return rent + serviceCharge;
    }

    const startDate = parseISO(tenant.lease.startDate);

    const isFirstMonth = isSameMonth(startDate, date);

    if (isFirstMonth) {
        // Rent + Deposit + Service Charge
        return (rent * 2) + serviceCharge;
    }

    return rent + serviceCharge;
}

/**
 * Determines if the payment status should be marked as Pending/Overdue
 * based on the 5th of the month rule.
 */
export function getRecommendedPaymentStatus(tenant: Tenant, date: Date = new Date()): Tenant['lease']['paymentStatus'] {
    const dueDay = 5;
    const currentDay = date.getDate();

    // If we are before the 5th, it's not "Overdue" yet, maybe "Pending"
    // If we are after the 5th and dueBalance > 0, it should be "Pending" or "Overdue"

    if ((tenant.dueBalance || 0) <= 0 && (tenant.accountBalance || 0) >= 0) {
        return 'Paid';
    }

    if (currentDay > dueDay) {
        return 'Pending'; // Or 'Overdue' if you want to be stricter
    }

    return 'Pending';
}

/**
 * Process a new payment and update the tenant's balances.
 */
export function processPayment(tenant: Tenant, paymentAmount: number): Partial<Tenant> {
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
        lease: {
            ...tenant.lease,
            paymentStatus: newDueBalance <= 0 ? 'Paid' : 'Pending',
            lastPaymentDate: format(new Date(), 'yyyy-MM-dd')
        }
    };
}

/**
 * Monthly reconciliation logic (should run on the 1st or when dashboard loads)
 * This adds the monthly rent/service charge to the dueBalance.
 */
export function reconcileMonthlyBilling(tenant: Tenant, date: Date = new Date()): Partial<Tenant> {
    // If a tenant has no lease information, we cannot perform billing.
    if (!tenant.lease) {
        console.warn(`Skipping billing for tenant ${tenant.name} (${tenant.id}) due to missing lease information.`);
        return {
            dueBalance: tenant.dueBalance,
            accountBalance: tenant.accountBalance,
        };
    }

    // Check if we've already billed for this month
    // In a real app, you'd track "lastBilledMonth"
    // For this simulation, we'll assume this function is called only once per month

    const monthlyCharge = calculateTargetDue(tenant, date);
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
        lease: {
            ...tenant.lease,
            paymentStatus: newDueBalance <= 0 ? 'Paid' : 'Pending'
        }
    };
}
