
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

    const clientOccupiedUnits: (Unit & { propertyId: string, propertyName: string })[] = [];
    allProperties.forEach(p => {
        (p.units || []).forEach(u => {
            if (u.managementStatus === 'Client Managed') {
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
            .filter(p => p.type === 'ServiceCharge' && p.status === 'Paid')
            .find(p => p.rentForMonth === format(selectedMonth, 'yyyy-MM')) : undefined;

        let paymentStatus: 'Paid' | 'Pending' | 'N/A';
        
        // A homeowner tenant record MUST exist for a charge to be applied.
        if (!tenant || (unit.serviceCharge || 0) <= 0) {
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
        const homeownerTenants = allTenants.filter(t => t.residentType === 'Homeowner' && ((owner.userId && t.userId === owner.userId) || t.email === owner.email));
        if (homeownerTenants.length === 0) continue;
        
        // Use the first tenant as representative for ledger generation.
        const repTenant = homeownerTenants[0];
        const allAssociatedPayments = allPayments.filter(p => homeownerTenants.some(t => t.id === p.tenantId));

        const { finalDueBalance, ledger } = generateLedger(repTenant, allAssociatedPayments, allProperties, [], owner, selectedMonth, { includeRent: false, includeWater: false, includeServiceCharge: true });

        if (finalDueBalance > 0) {
            const ownedUnits = allProperties.flatMap(p => 
                p.units.filter(u => u.landlordId === owner.id || ('assignedUnits' in owner && (owner as PropertyOwner).assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name))))
                .map(u => ({ ...u, property: p }))
            );
            
            const arrearBreakdownForOwner: VacantArrearsAccount = {
                ownerId: owner.id,
                ownerName: owner.name,
                owner,
                totalDue: finalDueBalance,
                units: [],
            };

            const pendingCharges = ledger.filter(l => l.charge > 0);
            
            const chargesByUnit = new Map<string, { totalDue: number, details: any[] }>();

            for (const charge of pendingCharges) {
                // The description is like "Service Charge for Unit: C301"
                const unitNameMatch = charge.description.match(/Unit: (.*)/);
                if (unitNameMatch) {
                    const unitName = unitNameMatch[1];
                     if (!chargesByUnit.has(unitName)) {
                        chargesByUnit.set(unitName, { totalDue: 0, details: [] });
                    }
                    const unitCharges = chargesByUnit.get(unitName)!;
                    unitCharges.totalDue += charge.charge;
                    unitCharges.details.push({ month: charge.forMonth, amount: charge.charge, status: 'Pending' as const });
                }
            }

            chargesByUnit.forEach((value, unitName) => {
                const unit = ownedUnits.find(u => u.name === unitName);
                if (unit) {
                    arrearBreakdownForOwner.units.push({
                        propertyId: unit.property.id,
                        propertyName: unit.property.name,
                        unitName: unit.name,
                        unitHandoverDate: unit.handoverDate || 'N/A',
                        monthsInArrears: value.details.length,
                        totalDue: value.totalDue,
                        arrearsDetail: value.details,
                        unit,
                        property: unit.property
                    })
                }
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
