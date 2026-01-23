import { Tenant, Unit, Property } from '@/lib/types';
import { getProperties, getTenants } from '@/lib/data';

/**
 * @fileOverview Service Charge Arrears Management
 *
 * This file contains the core logic for calculating and managing service charge arrears using the Firebase data model.
 */

export interface LandlordArrearsSummary {
  totalTenantArrears: number;
  vacantUnitServiceCharge: number;
  totalDeductions: number;
  breakdown: {
    unit: Unit;
    tenant: Tenant | undefined;
    tenantArrears: number;
    vacantServiceCharge: number;
  }[];
}

// --- Core Arrears Logic ---

/**
 * Gets a list of all tenants currently in arrears, sorted from most to least.
 * A tenant is in arrears if their `dueBalance` is greater than zero.
 * @returns A sorted list of tenants with their arrears amount.
 */
export async function getTenantsInArrears(): Promise<{ tenant: Tenant; arrears: number }[]> {
  const allTenants = await getTenants();
  
  const tenantsWithArrears = allTenants
    .map(tenant => ({
      tenant,
      arrears: tenant.dueBalance || 0, 
    }))
    .filter(item => item.arrears > 0);

  return tenantsWithArrears.sort((a, b) => b.arrears - a.arrears);
}

/**
 * Provides a breakdown of arrears and vacant unit charges for a landlord across all their units.
 * This data can be used to generate a detailed statement for the landlord.
 * @param landlordId The ID of the landlord.
 * @returns An object containing a summary and a per-unit breakdown.
 */
export async function getLandlordArrearsBreakdown(
  landlordId: string
): Promise<LandlordArrearsSummary> {
  const allProperties = await getProperties();
  const allTenants = await getTenants();

  const landlordUnits: { unit: Unit, property: Property }[] = [];
  allProperties.forEach(p => {
    p.units.forEach(u => {
      if (u.landlordId === landlordId) {
        landlordUnits.push({ unit: u, property: p });
      }
    });
  });

  let totalTenantArrears = 0;
  let vacantUnitServiceCharge = 0;

  const breakdown = landlordUnits.map(({ unit, property }) => {
    const tenant = allTenants.find(t => t.propertyId === property.id && t.unitName === unit.name);

    if (tenant) {
      // Unit is occupied, so we check for tenant arrears.
      const tenantArrears = tenant.dueBalance || 0;
      totalTenantArrears += tenantArrears;
      return {
        unit,
        tenant,
        tenantArrears,
        vacantServiceCharge: 0,
      };
    } else {
      // Unit is vacant. The landlord owes service charge if the unit has been handed over.
      let serviceCharge = 0;
      if (unit.handoverStatus === 'Handed Over') {
          serviceCharge = unit.serviceCharge || 0;
          vacantUnitServiceCharge += serviceCharge;
      }
      return {
        unit,
        tenant: undefined,
        tenantArrears: 0,
        vacantServiceCharge: serviceCharge,
      };
    }
  });

  return {
    totalTenantArrears,
    vacantUnitServiceCharge,
    totalDeductions: totalTenantArrears + vacantUnitServiceCharge,
    breakdown,
  };
}
