import { AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables, GetTenantPaymentsData, GetTenantPaymentsVariables, UpdateLeaseTermsData, UpdateLeaseTermsVariables, ListPropertiesData } from '../';
import { UseDataConnectQueryResult, useDataConnectQueryOptions, UseDataConnectMutationResult, useDataConnectMutationOptions} from '@tanstack-query-firebase/react/data-connect';
import { UseQueryResult, UseMutationResult} from '@tanstack/react-query';
import { DataConnect } from 'firebase/data-connect';
import { FirebaseError } from 'firebase/app';


export function useAddNewMaintenanceRequest(options?: useDataConnectMutationOptions<AddNewMaintenanceRequestData, FirebaseError, AddNewMaintenanceRequestVariables>): UseDataConnectMutationResult<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;
export function useAddNewMaintenanceRequest(dc: DataConnect, options?: useDataConnectMutationOptions<AddNewMaintenanceRequestData, FirebaseError, AddNewMaintenanceRequestVariables>): UseDataConnectMutationResult<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;

export function useGetTenantPayments(vars: GetTenantPaymentsVariables, options?: useDataConnectQueryOptions<GetTenantPaymentsData>): UseDataConnectQueryResult<GetTenantPaymentsData, GetTenantPaymentsVariables>;
export function useGetTenantPayments(dc: DataConnect, vars: GetTenantPaymentsVariables, options?: useDataConnectQueryOptions<GetTenantPaymentsData>): UseDataConnectQueryResult<GetTenantPaymentsData, GetTenantPaymentsVariables>;

export function useUpdateLeaseTerms(options?: useDataConnectMutationOptions<UpdateLeaseTermsData, FirebaseError, UpdateLeaseTermsVariables>): UseDataConnectMutationResult<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;
export function useUpdateLeaseTerms(dc: DataConnect, options?: useDataConnectMutationOptions<UpdateLeaseTermsData, FirebaseError, UpdateLeaseTermsVariables>): UseDataConnectMutationResult<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;

export function useListProperties(options?: useDataConnectQueryOptions<ListPropertiesData>): UseDataConnectQueryResult<ListPropertiesData, undefined>;
export function useListProperties(dc: DataConnect, options?: useDataConnectQueryOptions<ListPropertiesData>): UseDataConnectQueryResult<ListPropertiesData, undefined>;
