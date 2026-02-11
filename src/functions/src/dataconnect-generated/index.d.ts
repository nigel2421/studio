import { ConnectorConfig, DataConnect, QueryRef, QueryPromise, MutationRef, MutationPromise } from 'firebase/data-connect';

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

interface AddNewMaintenanceRequestRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddNewMaintenanceRequestVariables): MutationRef<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: AddNewMaintenanceRequestVariables): MutationRef<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;
  operationName: string;
}
export const addNewMaintenanceRequestRef: AddNewMaintenanceRequestRef;

export function addNewMaintenanceRequest(vars: AddNewMaintenanceRequestVariables): MutationPromise<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;
export function addNewMaintenanceRequest(dc: DataConnect, vars: AddNewMaintenanceRequestVariables): MutationPromise<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;

interface GetTenantPaymentsRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetTenantPaymentsVariables): QueryRef<GetTenantPaymentsData, GetTenantPaymentsVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: GetTenantPaymentsVariables): QueryRef<GetTenantPaymentsData, GetTenantPaymentsVariables>;
  operationName: string;
}
export const getTenantPaymentsRef: GetTenantPaymentsRef;

export function getTenantPayments(vars: GetTenantPaymentsVariables): QueryPromise<GetTenantPaymentsData, GetTenantPaymentsVariables>;
export function getTenantPayments(dc: DataConnect, vars: GetTenantPaymentsVariables): QueryPromise<GetTenantPaymentsData, GetTenantPaymentsVariables>;

interface UpdateLeaseTermsRef {
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateLeaseTermsVariables): MutationRef<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect, vars: UpdateLeaseTermsVariables): MutationRef<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;
  operationName: string;
}
export const updateLeaseTermsRef: UpdateLeaseTermsRef;

export function updateLeaseTerms(vars: UpdateLeaseTermsVariables): MutationPromise<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;
export function updateLeaseTerms(dc: DataConnect, vars: UpdateLeaseTermsVariables): MutationPromise<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;

interface ListPropertiesRef {
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListPropertiesData, undefined>;
  /* Allow users to pass in custom DataConnect instances */
  (dc: DataConnect): QueryRef<ListPropertiesData, undefined>;
  operationName: string;
}
export const listPropertiesRef: ListPropertiesRef;

export function listProperties(): QueryPromise<ListPropertiesData, undefined>;
export function listProperties(dc: DataConnect): QueryPromise<ListPropertiesData, undefined>;

