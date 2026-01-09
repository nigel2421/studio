
export type Property = {
  id: string;
  name: string;
  address: string;
  type: string;
  units: Unit[];
  imageId: string;
};

export type Unit = {
  name: string;
  status: 'vacant' | 'rented';
  managementType: 'owner' | 'contract' | 'self-owned';
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
  lease: {
    startDate: string;
    endDate: string;
    rent: number;
    paymentStatus: 'Paid' | 'Pending' | 'Overdue';
  };
};

export type MaintenanceRequest = {
  id: string;
  tenant: Tenant;
  property: Property;
  description: string;
  status: 'pending' | 'in-progress' | 'completed';
  createdAt: string;
};

