
export type Property = {
  id: string;
  name: string;
  address: string;
  type: string;
  units: Unit[];
  imageId: string;
};

export type ManagementType = 'owner' | 'contract' | 'self-owned';
export const managementTypes: ManagementType[] = ['owner', 'contract', 'self-owned'];

export type Unit = {
  name: string;
  status: 'vacant' | 'rented';
  managementType: ManagementType;
};

export type Agent = 'Susan' | 'Beatrice' | 'Nelly' | 'Dennis' | 'Peris' | 'Felista' | 'Martha' | 'Thomas' | 'Kiragu';

export const agents: Agent[] = ['Susan', 'Beatrice', 'Nelly', 'Dennis', 'Peris', 'Felista', 'Martha', 'Thomas', 'Kiragu'];

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
  rent: number;
  securityDeposit: number;
  lease: {
    startDate: string;
    endDate: string;
    rent: number;
    paymentStatus: 'Paid' | 'Pending' | 'Overdue';
  };
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

export type UserRole = 'admin' | 'viewer' | 'agent' | 'tenant';

export type UserProfile = {
    id: string;
    email: string;
    role: UserRole;
    name?: string;
    tenantId?: string;
    propertyId?: string;
    tenantDetails?: Tenant;
}
