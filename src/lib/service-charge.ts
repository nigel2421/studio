
import { Property, PropertyOwner, Tenant, Payment, Landlord, Unit } from './types';
import { format, startOfMonth, addMonths, isAfter, parseISO, isValid, isSameMonth, isBefore } from 'date-fns';
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
                const waivedMonth = handoverDay <= 10 ? startOfMonth(handoverDate) : startOfMonth(addMonths(handoverDate, 1));
                if (isSameMonth(selectedMonth, waivedMonth)) {
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

        const associatedTenant = allTenants.find(t => t.userId === owner.userId && t.residentType === 'Homeowner');
        const dummyTenant: Tenant = associatedTenant || {
            id: `dummy-${owner.id}`, name: owner.name, email: owner.email, phone: owner.phone, residentType: 'Homeowner',
            propertyId: '', unitName: '', dueBalance: 0, accountBalance: 0,
            lease: { startDate: '2000-01-01', rent: 0, paymentStatus: 'Pending', endDate: '2100-01-01' },
            idNumber: '', agent: 'Susan', status: 'active', securityDeposit: 0, waterDeposit: 0
        };

        const { finalDueBalance, ledger } = generateLedger(dummyTenant, allPayments, allProperties, [], owner, selectedMonth, { includeRent: false, includeWater: false, includeServiceCharge: true });

        if (finalDueBalance > 0) {
            const arrearBreakdownForOwner: VacantArrearsAccount = {
                ownerId: owner.id,
                ownerName: owner.name,
                owner,
                totalDue: finalDueBalance,
                units: [],
            };
            
            const pendingCharges = ledger.filter(l => l.charge > 0 && l.payment === 0);
            
            const chargesByUnit = new Map<string, { unit: Unit, property: Property, arrearsDetail: { month: string, amount: number, status: 'Pending' }[] }>();

            for (const charge of pendingCharges) {
                 const unitNameMatch = charge.description.match(/Unit: ([\w-]+)/);
                 if (unitNameMatch) {
                    const unitName = unitNameMatch[1];
                    const unitInfo = ownedVacantUnits.find(u => u.name === unitName);
                    if (unitInfo) {
                         if (!chargesByUnit.has(unitName)) {
                            chargesByUnit.set(unitName, { unit: unitInfo, property: unitInfo.property, arrearsDetail: [] });
                        }
                        chargesByUnit.get(unitName)!.arrearsDetail.push({
                            month: charge.forMonth || 'Unknown',
                            amount: charge.charge,
                            status: 'Pending'
                        });
                    }
                 }
            }

            chargesByUnit.forEach((data, unitName) => {
                 const totalDueForUnit = data.arrearsDetail.reduce((sum, item) => sum + item.amount, 0);
                 arrearBreakdownForOwner.units.push({
                     ...data,
                     unitName,
                     propertyId: data.property.id,
                     propertyName: data.property.name,
                     unitHandoverDate: data.unit.handoverDate || 'N/A',
                     monthsInArrears: data.arrearsDetail.length,
                     totalDue: totalDueForUnit,
                 });
            });
            
            if (arrearBreakdownForOwner.units.length > 0) {
                 vacantArrears.push(arrearBreakdownForOwner);
            }
        }
    }


    return {
        clientOccupiedServiceChargeAccounts,
        managedVacantServiceChargeAccounts,
        vacantArrears
    };
}
