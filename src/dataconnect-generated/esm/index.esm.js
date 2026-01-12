import { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } from 'firebase/data-connect';

export const connectorConfig = {
  connector: 'example',
  service: 'studio',
  location: 'us-east4'
};

export const addNewMaintenanceRequestRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'AddNewMaintenanceRequest', inputVars);
}
addNewMaintenanceRequestRef.operationName = 'AddNewMaintenanceRequest';

export function addNewMaintenanceRequest(dcOrVars, vars) {
  return executeMutation(addNewMaintenanceRequestRef(dcOrVars, vars));
}

export const getTenantPaymentsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetTenantPayments', inputVars);
}
getTenantPaymentsRef.operationName = 'GetTenantPayments';

export function getTenantPayments(dcOrVars, vars) {
  return executeQuery(getTenantPaymentsRef(dcOrVars, vars));
}

export const updateLeaseTermsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateLeaseTerms', inputVars);
}
updateLeaseTermsRef.operationName = 'UpdateLeaseTerms';

export function updateLeaseTerms(dcOrVars, vars) {
  return executeMutation(updateLeaseTermsRef(dcOrVars, vars));
}

export const listPropertiesRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListProperties');
}
listPropertiesRef.operationName = 'ListProperties';

export function listProperties(dc) {
  return executeQuery(listPropertiesRef(dc));
}

