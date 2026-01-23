

export type Property = {
  id: string;
  name: string;
  address: string;
  type: string;
  units: Unit[];
  imageId: string;
  landlordId?: string;
};

export type PropertyOwner = {
  id: string;
  name: string;
  email: string;
  phone: string;
  bankAccount?: string;
  assignedUnits: {
    propertyId: string;
    unitNames: string[];
  }[];
  userId?: string;
};

export type OwnershipType = 'SM' | 'Landlord';
export const ownershipTypes: OwnershipType[] = ['SM', 'Landlord'];

export type ManagementStatus =
  | 'Renting Mngd by Eracov for SM'
  | 'Renting Mngd by Eracov for Client'
  | 'Reserved for Airbnb'
  | 'Client Self Fully Managed';

export const managementStatuses: ManagementStatus[] = [
  'Renting Mngd by Eracov for SM',
  'Renting Mngd by Eracov for Client',
  'Reserved for Airbnb',
  'Client Self Fully Managed',
];

export type UnitType = 'Studio' | 'One Bedroom' | 'Two Bedroom' | 'Shop' | 'Three Bedroom';
export const unitTypes: UnitType[] = ['Studio', 'One Bedroom', 'Two Bedroom', 'Shop', 'Three Bedroom'];

export type UnitStatus = 'vacant' | 'rented' | 'airbnb' | 'client occupied';
export const unitStatuses: UnitStatus[] = ['vacant', 'rented', 'airbnb', 'client occupied'];

export type HandoverStatus = 'Pending' | 'Handed Over';
export const handoverStatuses: HandoverStatus[] = ['Pending', 'Handed Over'];

export type Unit = {
  name: string;
  status: UnitStatus;
  ownership: OwnershipType;
  unitType: UnitType;
  landlordId?: string;
  managementStatus?: ManagementStatus;
  rentAmount?: number;
  serviceCharge?: number;
  handoverStatus?: HandoverStatus;
  handoverDate?: string;
  propertyId?: string;
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

export type Task = {
  id: string;
  title: string;
  description: string;
  status: 'Pending' | 'In Progress' | 'Completed';
  priority: 'Low' | 'Medium' | 'High';
  dueDate: string;
  category: 'Onboarding' | 'Maintenance' | 'Administrative' | 'Financial';
  tenantId?: string;
  propertyId?: string;
  unitName?: string;
  createdAt: string;
};

export type PaymentStatus = 'Paid' | 'Pending' | 'Failed';

export type Payment = {
  id: string;
  tenantId: string;
  amount: number;
  date: string;
  notes?: string;
  rentForMonth?: string;
  createdAt: Date;
  reference?: string;
  status: PaymentStatus;
  type: 'Rent' | 'Deposit' | 'ServiceCharge' | 'Water' | 'Other';
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
  waterDeposit: number;
  residentType: 'Tenant' | 'Homeowner';
  lease: {
    startDate: string;
    endDate: string;
    rent: number;
    serviceCharge?: number;
    paymentStatus: 'Paid' | 'Pending' | 'Overdue';
    lastPaymentDate?: string;
    lastBilledPeriod?: string;
  };
  accountBalance: number; // For overpayments
  dueBalance: number;      // For carry-over debts
  waterReadings?: WaterMeterReading[];
  userId?: string;
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

export type UserRole = 'admin' | 'viewer' | 'agent' | 'tenant' | 'water-meter-reader' | 'landlord' | 'homeowner' | 'investment-consultant';

export type UserProfile = {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
  tenantId?: string;
  propertyId?: string;
  landlordId?: string;
  propertyOwnerId?: string;
  tenantDetails?: Tenant;
  landlordDetails?: {
    properties: { property: Property, units: Unit[] }[]
  };
  propertyOwnerDetails?: {
    properties: { property: Property, units: Unit[] }[]
  };
}

export type Log = {
  id: string;
  userId: string;
  action: string;
  timestamp: string;
}

export type Landlord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  bankAccount: string;
  userId?: string;
};

export type Communication = {
  id: string;
  type: 'announcement' | 'automation';
  subType?: string;
  subject: string;
  body: string;
  recipients: string[];
  recipientCount: number;
  senderId: string;
  timestamp: string;
  status: 'sent' | 'failed';
  relatedTenantId?: string;
};

export type ServiceChargeStatement = {
  id: string;
  tenantId: string;
  propertyId: string;
  unitName: string;
  period: string; // e.g., "January 2026"
  amount: number;
  items: { description: string; amount: number }[];
  date: string;
  status: 'Paid' | 'Pending';
  createdAt: Date;
};

export type DocumentType = 'Rent Receipt' | 'Water Bill' | 'Service Charge';

export type FinancialDocument = {
  id: string;
  type: DocumentType;
  date: string;
  amount: number;
  title: string;
  status: 'Paid' | 'Pending' | 'Overdue';
  description?: string;
  sourceData: Payment | WaterMeterReading | ServiceChargeStatement;
};
