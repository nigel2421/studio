const { queryRef, executeQuery, mutationRef, executeMutation, validateArgs } = require('firebase/data-connect');

const connectorConfig = {
  connector: 'example',
  service: 'studio',
  location: 'us-east4'
};
exports.connectorConfig = connectorConfig;

const addNewMaintenanceRequestRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'AddNewMaintenanceRequest', inputVars);
}
addNewMaintenanceRequestRef.operationName = 'AddNewMaintenanceRequest';
exports.addNewMaintenanceRequestRef = addNewMaintenanceRequestRef;

exports.addNewMaintenanceRequest = function addNewMaintenanceRequest(dcOrVars, vars) {
  return executeMutation(addNewMaintenanceRequestRef(dcOrVars, vars));
};

const getTenantPaymentsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'GetTenantPayments', inputVars);
}
getTenantPaymentsRef.operationName = 'GetTenantPayments';
exports.getTenantPaymentsRef = getTenantPaymentsRef;

exports.getTenantPayments = function getTenantPayments(dcOrVars, vars) {
  return executeQuery(getTenantPaymentsRef(dcOrVars, vars));
};

const updateLeaseTermsRef = (dcOrVars, vars) => {
  const { dc: dcInstance, vars: inputVars} = validateArgs(connectorConfig, dcOrVars, vars, true);
  dcInstance._useGeneratedSdk();
  return mutationRef(dcInstance, 'UpdateLeaseTerms', inputVars);
}
updateLeaseTermsRef.operationName = 'UpdateLeaseTerms';
exports.updateLeaseTermsRef = updateLeaseTermsRef;

exports.updateLeaseTerms = function updateLeaseTerms(dcOrVars, vars) {
  return executeMutation(updateLeaseTermsRef(dcOrVars, vars));
};

const listPropertiesRef = (dc) => {
  const { dc: dcInstance} = validateArgs(connectorConfig, dc, undefined);
  dcInstance._useGeneratedSdk();
  return queryRef(dcInstance, 'ListProperties');
}
listPropertiesRef.operationName = 'ListProperties';
exports.listPropertiesRef = listPropertiesRef;

exports.listProperties = function listProperties(dc) {
  return executeQuery(listPropertiesRef(dc));
};
