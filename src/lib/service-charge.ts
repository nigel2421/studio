import { Property, PropertyOwner, Tenant, Payment, Landlord, Unit } from './types';
import { format, startOfMonth, addMonths, isAfter, parseISO, isValid, isSameMonth, isBefore } from 'date-fns';

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

interface SingleUnitVacantArrearsAccount {
    ownerId: string;
    ownerName: string;
    propertyId: string;
    propertyName: string;
    unitName: string;
    unitHandoverDate: string;
    monthsInArrears: number;
    totalDue: number;
    arrearsDetail: { month: string, amount: number, status: 'Paid' | 'Pending' }[];
    unit: Unit;
    owner: PropertyOwner | Landlord;
    property: Property;
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
    const ownerByUnitMap = new Map<string, PropertyOwner>();
    allOwners.forEach(o => {
      o.assignedUnits?.forEach(au => {
        au.unitNames.forEach(unitName => {
          ownerByUnitMap.set(`${au.propertyId}-${unitName}`, o);
        });
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

    // --- Client Occupied Units Logic (formerly Self-managed) ---
    const clientOccupiedUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
    allProperties.forEach(p => {
        (p.units || []).forEach(u => {
            if (u.status === 'client occupied' && u.managementStatus === 'Client Managed' && u.handoverStatus === 'Handed Over') {
                clientOccupiedUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
            }
        });
    });

    const clientOccupiedServiceChargeAccounts: ServiceChargeAccount[] = clientOccupiedUnits.map(unit => {
        let owner: { id: string; name: string } | undefined;

        if (unit.landlordId) {
            owner = landlordMap.get(unit.landlordId);
        }
        
        if (!owner) {
            owner = ownerByUnitMap.get(`${unit.propertyId}-${unit.name}`);
        }

        const tenant = tenantMap.get(`${unit.propertyId}-${unit.name}`);
        
        const tenantPayments = tenant ? paymentsByTenantMap.get(tenant.id) || [] : [];
        const paymentInSelectedMonth = tenant ? tenantPayments
            .filter(p => (p.type === 'ServiceCharge' || p.type === 'Rent') && p.status === 'Paid')
            .find(p => p.rentForMonth === format(selectedMonth, 'yyyy-MM')) : undefined;

        let paymentStatus: 'Paid' | 'Pending' | 'N/A';
        
        let isBillable = false;
        if (unit.handoverDate) {
            const handoverDateSource = unit.handoverDate as any;
            const handoverDate = handoverDateSource && typeof handoverDateSource.toDate === 'function'
                ? handoverDateSource.toDate()
                : parseISO(handoverDateSource);
            
            if (isValid(handoverDate)) {
                const handoverDay = handoverDate.getDate();
                let firstBillableMonth: Date;
                if (handoverDay <= 10) {
                    firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
                } else {
                    firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
                }
                if (!isBefore(startOfMonth(selectedMonth), firstBillableMonth)) {
                    isBillable = true;
                }
            }
        } else if (unit.handoverStatus === 'Handed Over') {
            isBillable = true;
        }

        if (!isBillable) {
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

    // --- Managed Vacant Units Logic ---
    const managedVacantUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
    allProperties.forEach(p => {
      (p.units || []).forEach(u => {
        if (u.status === 'vacant' && u.managementStatus === 'Rented for Clients' && u.handoverStatus === 'Handed Over') {
          managedVacantUnits.push({ ...u, propertyId: p.id, propertyName: p.name });
        }
      });
    });
    
    const managedVacantServiceChargeAccounts: ServiceChargeAccount[] = managedVacantUnits.map(unit => {
      let owner: { id: string; name: string } | undefined;

      if (unit.landlordId) {
          owner = landlordMap.get(unit.landlordId);
      }
      
      if (!owner) {
          owner = ownerByUnitMap.get(`${unit.propertyId}-${unit.name}`);
      }

      const homeownerTenant = tenantMap.get(`${unit.propertyId}-${unit.name}`);
      const tenantPayments = homeownerTenant ? paymentsByTenantMap.get(homeownerTenant.id) || [] : [];
      const paymentForMonthExists = tenantPayments.some(p =>
            p.rentForMonth === format(selectedMonth, 'yyyy-MM') &&
            p.status === 'Paid' &&
            (p.type === 'ServiceCharge')
      );

      let paymentStatus: 'Paid' | 'Pending' | 'N/A';
      
      let isBillable = false;
      if (unit.handoverDate) {
          const handoverDateSource = unit.handoverDate as any;
          const handoverDate = handoverDateSource && typeof handoverDateSource.toDate === 'function'
              ? handoverDateSource.toDate()
              : parseISO(handoverDateSource);
          if (isValid(handoverDate)) {
            const handoverDay = handoverDate.getDate();
            let firstBillableMonth: Date;
            if (handoverDay <= 10) {
                firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
            } else {
                firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
            }
            if (!isBefore(startOfMonth(selectedMonth), firstBillableMonth)) {
                isBillable = true;
            }
          }
      } else if (unit.handoverStatus === 'Handed Over') {
          isBillable = true;
      }

      if (!isBillable) {
          paymentStatus = 'N/A';
      } else if (paymentForMonthExists) {
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
        tenantId: homeownerTenant?.id,
        tenantName: owner?.name, // Use owner name for display
        paymentStatus,
      };
    });


    // --- Vacant Units in Arrears Logic ---
    const individualArrears: SingleUnitVacantArrearsAccount[] = [];

    const liableUnits = allProperties.flatMap(p => 
      p.units
        .filter(u => 
            u.status === 'vacant' && 
            u.ownership === 'Landlord' && 
            u.handoverStatus === 'Handed Over' && 
            u.handoverDate &&
            u.managementStatus === 'Rented for Clients'
        )
        .map(u => ({ ...u, property: p }))
    );

    liableUnits.forEach(unit => {
      let owner: PropertyOwner | Landlord | undefined;
      
      const foundOwner = ownerByUnitMap.get(`${unit.property.id}-${unit.name}`);
      if(foundOwner) {
          owner = foundOwner;
      }

      if (!owner && unit.landlordId) {
          owner = landlordMap.get(unit.landlordId);
      }
      if (!owner) return; 

      const handoverDateSource = unit.handoverDate! as any;
      const handoverDate = handoverDateSource && typeof handoverDateSource.toDate === 'function'
          ? handoverDateSource.toDate()
          : parseISO(handoverDateSource);
      if (!isValid(handoverDate)) return;

      const handoverDay = handoverDate.getDate();
      let firstBillableMonth: Date;

      if (handoverDay <= 10) {
        firstBillableMonth = startOfMonth(addMonths(handoverDate, 1));
      } else {
        firstBillableMonth = startOfMonth(addMonths(handoverDate, 2));
      }
      
      const today = selectedMonth;
      
      if (isAfter(firstBillableMonth, today)) return; 

      const homeownerTenant = tenantMap.get(`${unit.property.id}-${unit.name}`);
      const paymentsForUnit = homeownerTenant ? paymentsByTenantMap.get(homeownerTenant.id) || [] : [];
      const totalPaid = paymentsForUnit.reduce((sum, p) => sum + p.amount, 0);

      let totalBilled = 0;
      const arrearsDetail: { month: string, amount: number, status: 'Paid' | 'Pending' }[] = [];
      let loopDate = firstBillableMonth;
      const startOfToday = startOfMonth(today);

      while (isBefore(loopDate, startOfToday) || isSameMonth(loopDate, startOfToday)) {
        const chargeForMonth = unit.serviceCharge || 0;
        if (chargeForMonth > 0) {
          totalBilled += chargeForMonth;
          arrearsDetail.push({
            month: format(loopDate, 'MMMM yyyy'),
            amount: chargeForMonth,
            status: 'Pending'
          });
        }
        loopDate = addMonths(loopDate, 1);
      }
      
      let paidAmountTracker = totalPaid;
      for (const detail of arrearsDetail) {
          if (paidAmountTracker >= detail.amount) {
              detail.status = 'Paid';
              paidAmountTracker -= detail.amount;
          } else {
              break; 
          }
      }

      const finalTotalDue = arrearsDetail
        .filter(d => d.status === 'Pending')
        .reduce((sum, d) => sum + d.amount, 0);

      if (finalTotalDue > 0) {
        individualArrears.push({
          ownerId: owner.id,
          ownerName: owner.name,
          propertyId: unit.property.id,
          propertyName: unit.property.name,
          unitName: unit.name,
          unitHandoverDate: unit.handoverDate!,
          monthsInArrears: arrearsDetail.filter(d => d.status === 'Pending').length,
          totalDue: finalTotalDue,
          arrearsDetail,
          unit,
          owner,
          property: unit.property
        });
      }
    });

    const groupedArrearsMap = new Map<string, VacantArrearsAccount>();
    individualArrears.forEach(arrear => {
        if (!groupedArrearsMap.has(arrear.ownerId)) {
            groupedArrearsMap.set(arrear.ownerId, {
                ownerId: arrear.ownerId,
                ownerName: arrear.ownerName,
                owner: arrear.owner,
                totalDue: 0,
                units: [],
            });
        }
        const group = groupedArrearsMap.get(arrear.ownerId)!;
        group.totalDue += arrear.totalDue;
        group.units.push({
            propertyId: arrear.propertyId,
            propertyName: arrear.propertyName,
            unitName: arrear.unitName,
            unitHandoverDate: arrear.unitHandoverDate,
            monthsInArrears: arrear.monthsInArrears,
            totalDue: arrear.totalDue,
            arrearsDetail: arrear.arrearsDetail,
            unit: arrear.unit,
            property: arrear.property,
        });
    });

    const vacantArrears = Array.from(groupedArrearsMap.values());

    return {
        clientOccupiedServiceChargeAccounts,
        managedVacantServiceChargeAccounts,
        vacantArrears
    };
}
