

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
  baselineReading?: number;
  handoverStatus?: HandoverStatus;
  handoverDate?: string;
  propertyId?: string;
  unitOrientation?: UnitOrientation;
};

export const agents = ['Kuria','Susan', 'Beatrice', 'Nelly', 'Dennis', 'Peris', 'Felista', 'Nyambura', 'Faith', 'Martha', 'Thomas', 'Kiragu'] as const;
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
  createdAt: string;
  status?: 'Paid' | 'Pending';
  paymentId?: string;
};

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

export type PaymentStatus = 'Paid' | 'Pending' | 'Failed' | 'Voided';

export const paymentMethods = ['M-Pesa', 'Bank Transfer', 'Card'] as const;

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
  type: 'Rent' | 'Deposit' | 'ServiceCharge' | 'Water' | 'Other' | 'Adjustment' | 'Reversal';
  status: PaymentStatus;
  notes?: string;
  rentForMonth?: string;
  // Optional fields for more detailed tracking
  paymentMethod: (typeof paymentMethods)[number];
  transactionId: string;
  createdAt: string;
  reference?: string;
  waterReadingId?: string;
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
  linkedTo?: string;
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
  createdAt: string;
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
    forMonth?: string;
    status?: PaymentStatus;
    // For water bills
    priorReading?: number;
    currentReading?: number;
    consumption?: number;
    rate?: number;
    unitName?: string;
}

export type Lease = {
    startDate: string;
    endDate: string;
    rent: number;
    serviceCharge?: number;
    paymentStatus: 'Paid' | 'Pending' | 'Overdue';
    lastBilledPeriod?: string;
    lastPaymentDate?: string;
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
  residentType: 'Tenant' | 'Homeowner';
  lease: Lease;
  securityDeposit: number;
  waterDeposit: number;
  dueBalance: number;
  accountBalance: number;
  userId?: string;
};

export type ArchivedTenant = Tenant & {
  archivedAt: string;
};

export type Landlord = {
  id: string;
  name: string;
  email: string;
  phone: string;
  bankAccount?: string;
  userId?: string;
  deductStageTwoCost?: boolean;
  deductStageThreeCost?: boolean;
};

export const userRoles = ['admin', 'agent', 'tenant', 'landlord', 'viewer', 'water-meter-reader', 'investment-consultant', 'accounts', 'homeowner'] as const;
export type UserRole = (typeof userRoles)[number];

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
};

export type Log = {
  id: string;
  userId: string;
  userEmail: string;
  action: string;
  timestamp: string;
};

export type FinancialSummary = {
    totalRent: number;
    totalManagementFees: number;
    totalServiceCharges: number;
    totalOtherCosts: number;
    totalStageTwoCost: number;
    totalStageThreeCost: number;
    totalNetRemittance: number;
    transactionCount: number;
    vacantUnitServiceChargeDeduction?: number;
};

export const maintenanceCategories = ['Plumbing', 'Electrical', 'HVAC', 'General', 'Appliance', 'Other'] as const;
export type MaintenanceCategory = (typeof maintenanceCategories)[number];

export const maintenancePriorities = ['Low', 'Medium', 'High', 'Urgent'] as const;
export type MaintenancePriority = (typeof maintenancePriorities)[number];

export const maintenanceStatuses = ['New', 'In Progress', 'Completed', 'Cancelled'] as const;
export type MaintenanceStatus = (typeof maintenanceStatuses)[number];

export type MaintenanceRequest = {
  id: string;
  tenantId: string;
  propertyId: string;
  title: string;
  description: string;
  category: MaintenanceCategory;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  date: string; // Submission date, matches createdAt
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
};

export type NoticeToVacate = {
  id: string;
  tenantId: string;
  propertyId: string;
  unitName: string;
  tenantName: string;
  propertyName: string;
  noticeSubmissionDate: string;
  scheduledMoveOutDate: string;
  submittedBy: 'Admin' | 'Tenant';
  submittedByName: string;
  status: 'Active' | 'Completed';
  reason?: string;
};
