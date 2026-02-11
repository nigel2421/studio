import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface AddNewMaintenanceRequestData {
  maintenanceRequest_insert: MaintenanceRequest_Key;
}

export interface AddNewMaintenanceRequestVariables {
  propertyId: UUIDString;
  tenantId: UUIDString;
  description: string;
  status: string;
  submittedAt: TimestampString;
}

export interface GetTenantPaymentsData {
  payments: ({
    id: UUIDString;
    amount: number;
    paymentDate: DateString;
    paymentMethod?: string | null;
    status: string;
    transactionId?: string | null;
  } & Payment_Key)[];
}

export interface GetTenantPaymentsVariables {
  tenantId: UUIDString;
}

export interface Lease_Key {
  id: UUIDString;
  __typename?: 'Lease_Key';
}

export interface ListPropertiesData {
  properties: ({
    id: UUIDString;
    address: string;
    city: string;
    state: string;
    zipCode: string;
    propertyType: string;
    rentAmount?: number | null;
  } & Property_Key)[];
}

export interface MaintenanceRequest_Key {
  id: UUIDString;
  __typename?: 'MaintenanceRequest_Key';
}

export interface Payment_Key {
  id: UUIDString;
  __typename?: 'Payment_Key';
}

export interface Property_Key {
  id: UUIDString;
  __typename?: 'Property_Key';
}

export interface Tenant_Key {
  id: UUIDString;
  __typename?: 'Tenant_Key';
}

export interface UpdateLeaseTermsData {
  lease_update?: Lease_Key | null;
}

export interface UpdateLeaseTermsVariables {
  leaseId: UUIDString;
  leaseTerms: string;
}

export interface User_Key {
  id: UUIDString;
  __typename?: 'User_Key';
}

/** Generated Node Admin SDK operation action function for the 'AddNewMaintenanceRequest' Mutation. Allow users to execute without passing in DataConnect. */
export function addNewMaintenanceRequest(dc: DataConnect, vars: AddNewMaintenanceRequestVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AddNewMaintenanceRequestData>>;
/** Generated Node Admin SDK operation action function for the 'AddNewMaintenanceRequest' Mutation. Allow users to pass in custom DataConnect instances. */
export function addNewMaintenanceRequest(vars: AddNewMaintenanceRequestVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AddNewMaintenanceRequestData>>;

/** Generated Node Admin SDK operation action function for the 'GetTenantPayments' Query. Allow users to execute without passing in DataConnect. */
export function getTenantPayments(dc: DataConnect, vars: GetTenantPaymentsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetTenantPaymentsData>>;
/** Generated Node Admin SDK operation action function for the 'GetTenantPayments' Query. Allow users to pass in custom DataConnect instances. */
export function getTenantPayments(vars: GetTenantPaymentsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetTenantPaymentsData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateLeaseTerms' Mutation. Allow users to execute without passing in DataConnect. */
export function updateLeaseTerms(dc: DataConnect, vars: UpdateLeaseTermsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateLeaseTermsData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateLeaseTerms' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateLeaseTerms(vars: UpdateLeaseTermsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateLeaseTermsData>>;

/** Generated Node Admin SDK operation action function for the 'ListProperties' Query. Allow users to execute without passing in DataConnect. */
export function listProperties(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ListPropertiesData>>;
/** Generated Node Admin SDK operation action function for the 'ListProperties' Query. Allow users to pass in custom DataConnect instances. */
export function listProperties(options?: OperationOptions): Promise<ExecuteOperationResponse<ListPropertiesData>>;

