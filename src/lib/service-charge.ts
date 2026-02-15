
import { Property, PropertyOwner, Tenant, Payment, Landlord, Unit } from './types';
import { format, startOfMonth, addMonths, isAfter, parseISO, isValid, isSameMonth, isBefore, differenceInMonths } from 'date-fns';
import { generateLedger } from './financial-logic';

export interface ServiceChargeAccount {
  propertyId: string;
  propertyName: string;
  unitName: string;
  unitServiceCharge: number;
  ownerId?: string;
  ownerName?: string;
  tenantId?: string;
  tenantName?: string;
  paymentStatus: 'Paid' | 'Pending' | 'N/A';
  paymentAmount?: number;
  paymentForMonth?: string;
}

export interface GroupedServiceChargeAccount {
  groupId: string;
  ownerId?: string;
  ownerName: string;
  units: ServiceChargeAccount[];
  totalServiceCharge: number;
  paymentStatus: 'Paid' | 'Pending' | 'N/A';
}

export interface VacantArrearsAccount {
    ownerId: string;
    ownerName: string;
    owner: PropertyOwner | Landlord;
    totalDue: number;
    units: {
        propertyId: string;
        propertyName: string;
        unitName: string;
        unitHandoverDate: string;
        monthsInArrears: number;
        totalDue: number;
        arrearsDetail: { month: string, amount: number, status: 'Paid' | 'Pending' }[];
        unit: Unit;
        property: Property;
    }[];
}

export function groupAccounts(accounts: ServiceChargeAccount[]): GroupedServiceChargeAccount[] {
    const grouped = accounts.reduce((acc, account) => {
        const key = account.ownerId || `unassigned-${account.propertyName}-${account.unitName}`;
        if (!acc[key]) {
            acc[key] = {
                groupId: key,
                ownerId: account.ownerId,
                ownerName: account.ownerName || 'Unassigned',
                units: [],
                totalServiceCharge: 0,
                paymentStatus: 'Paid', // Default
            };
        }
        acc[key].units.push(account);
        acc[key].totalServiceCharge += account.unitServiceCharge;
        return acc;
    }, {} as Record<string, GroupedServiceChargeAccount>);

    return Object.values(grouped).map(group => {
        const statuses = group.units.map(u => u.paymentStatus);
        if (statuses.includes('Pending')) {
            group.paymentStatus = 'Pending';
        } else if (statuses.every(s => s === 'N/A')) {
            group.paymentStatus = 'N/A';
        } else if (statuses.every(s => s === 'Paid' || s === 'N/A')) {
            group.paymentStatus = 'Paid';
        } else {
            group.paymentStatus = 'Pending'; // Default for mixed statuses
        }
        return group;
    });
};


export function processServiceChargeData(
    allProperties: Property[],
    allOwners: PropertyOwner[],
    allTenants: Tenant[],
    allPayments: Payment[],
    allLandlords: Landlord[],
    selectedMonth: Date
) {
    const landlordMap = new Map(allLandlords.map(l => [l.id, l]));
    const ownerMap = new Map(allOwners.map(o => [o.id, o]));

    const ownerByUnitMap = new Map<string, PropertyOwner | Landlord>();
    allOwners.forEach(o => {
      o.assignedUnits?.forEach(au => {
        au.unitNames.forEach(unitName => {
          ownerByUnitMap.set(`${au.propertyId}-${unitName}`, o);
        });
      });
    });
    allProperties.forEach(p => {
        (p.units || []).forEach(u => {
            if (u.landlordId && landlordMap.has(u.landlordId)) {
                ownerByUnitMap.set(`${p.id}-${u.name}`, landlordMap.get(u.landlordId)!);
            }
        });
    });

    const tenantMap = new Map(allTenants.map(t => [`${t.propertyId}-${t.unitName}`, t]));
    const paymentsByTenantMap = new Map<string, Payment[]>();
    allPayments.forEach(p => {
      if (!paymentsByTenantMap.has(p.tenantId)) {
        paymentsByTenantMap.set(p.tenantId, []);
      }
      paymentsByTenantMap.get(p.tenantId)!.push(p);
    });

    const clientOccupiedUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
    allProperties.forEach(p => {
        (p.units || []).forEach(u => {
            if (u.managementStatus === 'Client Managed') {
                clientOccupiedUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
            }
        });
    });

    const clientOccupiedServiceChargeAccounts: ServiceChargeAccount[] = clientOccupiedUnits.map(unit => {
        const owner = ownerByUnitMap.get(`${unit.propertyId}-${unit.name}`);
        const tenant = tenantMap.get(`${unit.propertyId}-${unit.name}`);
        const tenantPayments = tenant ? paymentsByTenantMap.get(tenant.id) || [] : [];
        const paymentInSelectedMonth = tenantPayments
            .filter(p => p.type === 'ServiceCharge' && p.status === 'Paid')
            .find(p => p.rentForMonth === format(selectedMonth, 'yyyy-MM'));

        let isWaived = false;
        if (unit.handoverDate) {
            const handoverDate = parseISO(unit.handoverDate);
            if (isValid(handoverDate)) {
                const handoverDay = handoverDate.getDate();
                let firstBillableMonth: Date;
                if (handoverDay <= 10) {
                    firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
                } else {
                    firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
                }
                
                if (isBefore(startOfMonth(selectedMonth), firstBillableMonth)) {
                    isWaived = true;
                }
            }
        }
        
        let paymentStatus: 'Paid' | 'Pending' | 'N/A';
        
        if (isWaived || (unit.serviceCharge || 0) <= 0) {
            paymentStatus = 'N/A';
        } else if (paymentInSelectedMonth) {
            paymentStatus = 'Paid';
        } else {
            paymentStatus = 'Pending';
        }

        return {
            propertyId: unit.propertyId,
            propertyName: unit.propertyName,
            unitName: unit.name,
            unitServiceCharge: unit.serviceCharge || 0,
            ownerId: owner?.id,
            ownerName: owner?.name || 'Unassigned',
            tenantId: tenant?.id,
            tenantName: tenant?.name,
            paymentStatus,
            paymentAmount: paymentInSelectedMonth?.amount,
            paymentForMonth: paymentInSelectedMonth?.rentForMonth,
        };
    });

    const managedVacantUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
    allProperties.forEach(p => {
      (p.units || []).forEach(u => {
        if (u.status === 'vacant' && u.managementStatus === 'Rented for Clients' && u.handoverStatus === 'Handed Over') {
          managedVacantUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
        }
      });
    });
    
    const managedVacantServiceChargeAccounts: ServiceChargeAccount[] = managedVacantUnits.map(unit => {
      const owner = ownerByUnitMap.get(`${unit.propertyId}-${unit.name}`);
      const homeownerTenant = tenantMap.get(`${unit.propertyId}-${unit.name}`);
      const tenantPayments = homeownerTenant ? paymentsByTenantMap.get(homeownerTenant.id) || [] : [];
      const paymentForMonthExists = tenantPayments.some(p =>
            p.rentForMonth === format(selectedMonth, 'yyyy-MM') &&
            p.status === 'Paid' &&
            p.type === 'ServiceCharge'
      );

      return {
        propertyId: unit.propertyId,
        propertyName: unit.propertyName,
        unitName: unit.name,
        unitServiceCharge: unit.serviceCharge || 0,
        ownerId: owner?.id,
        ownerName: owner?.name || 'Unassigned',
        tenantId: homeownerTenant?.id,
        tenantName: owner?.name, // Use owner name for display
        paymentStatus: paymentForMonthExists ? 'Paid' : 'Pending',
      };
    });
    
    const vacantArrears: VacantArrearsAccount[] = [];
    const allClientOwnersAndLandlords = [...allOwners, ...allLandlords];

    for (const owner of allClientOwnersAndLandlords) {
        const ownedVacantUnits = allProperties.flatMap(p => 
            p.units.filter(u =>
                u.status === 'vacant' &&
                u.handoverStatus === 'Handed Over' &&
                (u.landlordId === owner.id || ownerByUnitMap.get(`${p.id}-${u.name}`)?.id === owner.id)
            ).map(u => ({ ...u, property: p }))
        );

        if (ownedVacantUnits.length === 0) continue;

        let totalDueForOwner = 0;
        const unitsWithArrears: VacantArrearsAccount['units'] = [];

        for (const unit of ownedVacantUnits) {
            if (!unit.handoverDate || !unit.serviceCharge || unit.serviceCharge <= 0) continue;
            
            const handoverDate = parseISO(unit.handoverDate);
            const handoverDay = handoverDate.getDate();
            let firstBillableMonth: Date;

            if (handoverDay <= 10) {
                // If handed over on or before the 10th, the next month is the first billable one.
                // e.g., Handover Jan 10 -> Waive Jan -> Bill Feb.
                firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
            } else {
                // If handed over after the 10th, the next TWO months are waived.
                // e.g., Handover Jan 11 -> Waive Jan, Waive Feb -> Bill March.
                firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
            }
            
            if (isAfter(firstBillableMonth, selectedMonth)) {
                continue; // Not yet billable as of the selected date
            }

            const monthsOfArrears = differenceInMonths(startOfMonth(selectedMonth), firstBillableMonth) + 1;
            
            if (monthsOfArrears <= 0) continue;

            const totalDueForUnit = monthsOfArrears * unit.serviceCharge;
            totalDueForOwner += totalDueForUnit;

            const arrearsDetail: VacantArrearsAccount['units'][0]['arrearsDetail'] = [];
            for (let i = 0; i < monthsOfArrears; i++) {
                const month = format(addMonths(firstBillableMonth, i), 'MMM yyyy');
                arrearsDetail.push({ month, amount: unit.serviceCharge, status: 'Pending' });
            }
            
            unitsWithArrears.push({
                unit,
                property: unit.property,
                unitName: unit.name,
                propertyId: unit.property.id,
                propertyName: unit.property.name,
                unitHandoverDate: unit.handoverDate,
                monthsInArrears,
                totalDue: totalDueForUnit,
                arrearsDetail,
            });
        }

        if (totalDueForOwner > 0) {
            vacantArrears.push({
                ownerId: owner.id,
                ownerName: owner.name,
                owner: owner,
                totalDue: totalDueForOwner,
                units: unitsWithArrears
            });
        }
    }


    return {
        clientOccupiedServiceChargeAccounts,
        managedVacantServiceChargeAccounts,
        vacantArrears
    };
}
