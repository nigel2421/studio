
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

export const ownershipTypes = ['SM', 'Landlord'] as const;
export type OwnershipType = (typeof ownershipTypes)[number];

export const managementStatuses = [
  'Rented for Soil Merchants',
  'Rented for Clients',
  'Client Managed',
  'Airbnb',
] as const;
export type ManagementStatus = (typeof managementStatuses)[number];

export const unitTypes = ['Studio', 'One Bedroom', 'Two Bedroom', 'Shop', 'Three Bedroom'] as const;
export type UnitType = (typeof unitTypes)[number];

export const unitStatuses = ['vacant', 'rented', 'airbnb', 'client occupied'] as const;
export type UnitStatus = (typeof unitStatuses)[number];

export const handoverStatuses = ['Pending Hand Over', 'Handed Over'] as const;
export type HandoverStatus = (typeof handoverStatuses)[number];

export const unitOrientations = ['MURANG\'A.RD', 'FOREST.RD', 'GMA-ANNEX', 'MUTHAIGA', 'MID-BLOCK UNIT'] as const;
export type UnitOrientation = (typeof unitOrientations)[number];

export const unitOrientationColors: Record<UnitOrientation, string> = {
    'MURANG\'A.RD': 'bg-green-100 text-green-800',
    'FOREST.RD': 'bg-blue-100 text-blue-800',
    'GMA-ANNEX': 'bg-yellow-100 text-yellow-800',
    'MUTHAIGA': 'bg-purple-100 text-purple-800',
    'MID-BLOCK UNIT': 'bg-gray-100 text-gray-800',
};

export const unitOrientationHexColors: Record<UnitOrientation, string> = {
    'MURANG\'A.RD': '#4ade80',
    'FOREST.RD': '#60a5fa',
    'GMA-ANNEX': '#facc15',
    'MUTHAIGA': '#c084fc',
    'MID-BLOCK UNIT': '#9ca3af',
};

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
  unitOrientation?: UnitOrientation;
};

export const agents = ['Susan', 'Beatrice', 'Nelly', 'Dennis', 'Peris', 'Felista', 'Martha', 'Thomas', 'Kiragu'] as const;
export type Agent = (typeof agents)[number];

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
  type: 'Rent' | 'Deposit' | 'ServiceCharge' | 'Water' | 'Other' | 'Adjustment';
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
  bankAccount?: string;
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
