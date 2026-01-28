



export type Property = {
  id: string;
  name: string;
  address: string;
  type: string;
  units: Unit[];
  imageId: string;
  landlordId?: string;
  lateFee?: number;
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

/**
 * Represents a single financial transaction.
 * This can be a payment from a tenant, or a debit/credit adjustment from management.
 * Adjustments (like late fees) are a 'Payment' of type 'Adjustment'.
 * A positive amount for an adjustment is a DEBIT (increases due balance).
 * A negative amount for an adjustment is a CREDIT (decreases due balance).
 */
export type Payment = {
  id: string;
  tenantId: string;
  amount: number;
  date: string;
  type: 'Rent' | 'Deposit' | 'ServiceCharge' | 'Water' | 'Other' | 'Adjustment';
  status: PaymentStatus;
  notes?: string;
  rentForMonth?: string;
  // Optional fields for more detailed tracking
  paymentMethod?: 'Cash' | 'M-Pesa' | 'Bank Transfer' | 'Card';
  transactionId?: string; // e.g., M-Pesa transaction code
  createdAt: Date;
  reference?: string;
  editHistory?: {
    editedAt: string;
    editedBy: string;
    reason: string;
    previousValues: {
      amount: number;
      date: string;
      notes?: string;
    };
  }[];
};

/**
 * Represents the lease terms associated with a tenant.
 * It's embedded within the Tenant object for simplicity.
 */
export type Lease = {
  startDate: string;
  endDate: string;
  rent: number;
  serviceCharge?: number;
  paymentStatus: 'Paid' | 'Pending' | 'Overdue';
  lastPaymentDate?: string;
  lastBilledPeriod?: string;
  lastLateFeeAppliedPeriod?: string;
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
  lease: Lease;
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

/**
 * Represents any communication sent out from the system.
 * This covers automated reminders, manual announcements, and receipts.
 */
export type Communication = {
  id: string;
  type: 'announcement' | 'automation';
  subType?: string; // e.g., 'Payment Receipt', 'Arrears Reminder'
  subject: string;
  body: string;
  recipients: string[];
  recipientCount: number;
  senderId: string; // 'system' or a user ID
  timestamp: string;
  status: 'sent' | 'failed';
  deliveryMethod?: 'email' | 'sms' | 'in-app'; // Defaults to email
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

export interface LedgerEntry {
    id: string;
    date: string;
    description: string;
    charge: number;
    payment: number;
    balance: number;
}
