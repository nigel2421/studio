

export type Property = {
  id: string;
  name: string;
  address: string;
  type: string;
  units: Unit[];
  imageId: string;
};

export type OwnershipType = 'SM' | 'Landlord';
export const ownershipTypes: OwnershipType[] = ['SM', 'Landlord'];

export type UnitType = 'Studio' | 'One Bedroom' | 'Two Bedroom';
export const unitTypes: UnitType[] = ['Studio', 'One Bedroom', 'Two Bedroom'];

export type Unit = {
  name: string;
  status: 'vacant' | 'rented';
  ownership: OwnershipType;
  unitType: UnitType;
};

export type Agent = 'Susan' | 'Beatrice' | 'Nelly' | 'Dennis' | 'Peris' | 'Felista' | 'Martha' | 'Thomas' | 'Kiragu';

export const agents: Agent[] = ['Susan', 'Beatrice', 'Nelly', 'Dennis', 'Peris', 'Felista', 'Martha', 'Thomas', 'Kiragu'];

export type WaterMeterReading = {
    id: string;
    tenantId: string;
    propertyId: string;
    unitName: string;
    priorReading: number;
    currentReading: number;
    consumption: number;
    rate: number;
    amount: number;
    date: string;
    createdAt: Date;
}

export type Payment = {
    id: string;
    tenantId: string;
    amount: number;
    date: string;
    notes?: string;
    createdAt: Date;
};

export type Tenant = {
  id: string;
  name: string;
  email: string;
  phone: string;
  idNumber: string;
  propertyId: string;
  unitName: string;
  agent: Agent;
  status: 'active' | 'archived';
  securityDeposit: number;
  lease: {
    startDate: string;
    endDate: string;
    rent: number;
    paymentStatus: 'Paid' | 'Pending' | 'Overdue';
    lastPaymentDate?: string;
  };
  waterReadings?: WaterMeterReading[];
};

export type ArchivedTenant = Tenant & {
    archivedAt: string;
}

export type MaintenanceRequest = {
  id: string;
  tenantId: string;
  propertyId: string;
  date: string;
  details: string;
  urgency: 'high' | 'medium' | 'low';
  status: 'New' | 'In Progress' | 'Completed';
  createdAt: Date;
};

export type UserRole = 'admin' | 'viewer' | 'agent' | 'tenant' | 'water-meter-reader';

export type UserProfile = {
    id: string;
    email: string;
    role: UserRole;
    name?: string;
    tenantId?: string;
    propertyId?: string;
    tenantDetails?: Tenant;
}
