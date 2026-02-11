# Generated TypeScript README
This README will guide you through the process of using the generated JavaScript SDK package for the connector `example`. It will also provide examples on how to use your generated SDK to call your Data Connect queries and mutations.

***NOTE:** This README is generated alongside the generated SDK. If you make changes to this file, they will be overwritten when the SDK is regenerated.*

# Table of Contents
- [**Overview**](#generated-javascript-readme)
- [**Accessing the connector**](#accessing-the-connector)
  - [*Connecting to the local Emulator*](#connecting-to-the-local-emulator)
- [**Queries**](#queries)
  - [*GetTenantPayments*](#gettenantpayments)
  - [*ListProperties*](#listproperties)
- [**Mutations**](#mutations)
  - [*AddNewMaintenanceRequest*](#addnewmaintenancerequest)
  - [*UpdateLeaseTerms*](#updateleaseterms)

# Accessing the connector
A connector is a collection of Queries and Mutations. One SDK is generated for each connector - this SDK is generated for the connector `example`. You can find more information about connectors in the [Data Connect documentation](https://firebase.google.com/docs/data-connect#how-does).

You can use this generated SDK by importing from the package `@dataconnect/generated` as shown below. Both CommonJS and ESM imports are supported.

You can also follow the instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#set-client).

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
```

## Connecting to the local Emulator
By default, the connector will connect to the production service.

To connect to the emulator, you can use the following code.
You can also follow the emulator instructions from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#instrument-clients).

```typescript
import { connectDataConnectEmulator, getDataConnect } from 'firebase/data-connect';
import { connectorConfig } from '@dataconnect/generated';

const dataConnect = getDataConnect(connectorConfig);
connectDataConnectEmulator(dataConnect, 'localhost', 9399);
```

After it's initialized, you can call your Data Connect [queries](#queries) and [mutations](#mutations) from your generated SDK.

# Queries

There are two ways to execute a Data Connect Query using the generated Web SDK:
- Using a Query Reference function, which returns a `QueryRef`
  - The `QueryRef` can be used as an argument to `executeQuery()`, which will execute the Query and return a `QueryPromise`
- Using an action shortcut function, which returns a `QueryPromise`
  - Calling the action shortcut function will execute the Query and return a `QueryPromise`

The following is true for both the action shortcut function and the `QueryRef` function:
- The `QueryPromise` returned will resolve to the result of the Query once it has finished executing
- If the Query accepts arguments, both the action shortcut function and the `QueryRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Query
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each query. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-queries).

## GetTenantPayments
You can execute the `GetTenantPayments` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
getTenantPayments(vars: GetTenantPaymentsVariables): QueryPromise<GetTenantPaymentsData, GetTenantPaymentsVariables>;

interface GetTenantPaymentsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: GetTenantPaymentsVariables): QueryRef<GetTenantPaymentsData, GetTenantPaymentsVariables>;
}
export const getTenantPaymentsRef: GetTenantPaymentsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
getTenantPayments(dc: DataConnect, vars: GetTenantPaymentsVariables): QueryPromise<GetTenantPaymentsData, GetTenantPaymentsVariables>;

interface GetTenantPaymentsRef {
  ...
  (dc: DataConnect, vars: GetTenantPaymentsVariables): QueryRef<GetTenantPaymentsData, GetTenantPaymentsVariables>;
}
export const getTenantPaymentsRef: GetTenantPaymentsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the getTenantPaymentsRef:
```typescript
const name = getTenantPaymentsRef.operationName;
console.log(name);
```

### Variables
The `GetTenantPayments` query requires an argument of type `GetTenantPaymentsVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface GetTenantPaymentsVariables {
  tenantId: UUIDString;
}
```
### Return Type
Recall that executing the `GetTenantPayments` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `GetTenantPaymentsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `GetTenantPayments`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, getTenantPayments, GetTenantPaymentsVariables } from '@dataconnect/generated';

// The `GetTenantPayments` query requires an argument of type `GetTenantPaymentsVariables`:
const getTenantPaymentsVars: GetTenantPaymentsVariables = {
  tenantId: ..., 
};

// Call the `getTenantPayments()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await getTenantPayments(getTenantPaymentsVars);
// Variables can be defined inline as well.
const { data } = await getTenantPayments({ tenantId: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await getTenantPayments(dataConnect, getTenantPaymentsVars);

console.log(data.payments);

// Or, you can use the `Promise` API.
getTenantPayments(getTenantPaymentsVars).then((response) => {
  const data = response.data;
  console.log(data.payments);
});
```

### Using `GetTenantPayments`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, getTenantPaymentsRef, GetTenantPaymentsVariables } from '@dataconnect/generated';

// The `GetTenantPayments` query requires an argument of type `GetTenantPaymentsVariables`:
const getTenantPaymentsVars: GetTenantPaymentsVariables = {
  tenantId: ..., 
};

// Call the `getTenantPaymentsRef()` function to get a reference to the query.
const ref = getTenantPaymentsRef(getTenantPaymentsVars);
// Variables can be defined inline as well.
const ref = getTenantPaymentsRef({ tenantId: ..., });

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = getTenantPaymentsRef(dataConnect, getTenantPaymentsVars);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.payments);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.payments);
});
```

## ListProperties
You can execute the `ListProperties` query using the following action shortcut function, or by calling `executeQuery()` after calling the following `QueryRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
listProperties(): QueryPromise<ListPropertiesData, undefined>;

interface ListPropertiesRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (): QueryRef<ListPropertiesData, undefined>;
}
export const listPropertiesRef: ListPropertiesRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `QueryRef` function.
```typescript
listProperties(dc: DataConnect): QueryPromise<ListPropertiesData, undefined>;

interface ListPropertiesRef {
  ...
  (dc: DataConnect): QueryRef<ListPropertiesData, undefined>;
}
export const listPropertiesRef: ListPropertiesRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the listPropertiesRef:
```typescript
const name = listPropertiesRef.operationName;
console.log(name);
```

### Variables
The `ListProperties` query has no variables.
### Return Type
Recall that executing the `ListProperties` query returns a `QueryPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `ListPropertiesData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
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
```
### Using `ListProperties`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, listProperties } from '@dataconnect/generated';


// Call the `listProperties()` function to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await listProperties();

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await listProperties(dataConnect);

console.log(data.properties);

// Or, you can use the `Promise` API.
listProperties().then((response) => {
  const data = response.data;
  console.log(data.properties);
});
```

### Using `ListProperties`'s `QueryRef` function

```typescript
import { getDataConnect, executeQuery } from 'firebase/data-connect';
import { connectorConfig, listPropertiesRef } from '@dataconnect/generated';


// Call the `listPropertiesRef()` function to get a reference to the query.
const ref = listPropertiesRef();

// You can also pass in a `DataConnect` instance to the `QueryRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = listPropertiesRef(dataConnect);

// Call `executeQuery()` on the reference to execute the query.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeQuery(ref);

console.log(data.properties);

// Or, you can use the `Promise` API.
executeQuery(ref).then((response) => {
  const data = response.data;
  console.log(data.properties);
});
```

# Mutations

There are two ways to execute a Data Connect Mutation using the generated Web SDK:
- Using a Mutation Reference function, which returns a `MutationRef`
  - The `MutationRef` can be used as an argument to `executeMutation()`, which will execute the Mutation and return a `MutationPromise`
- Using an action shortcut function, which returns a `MutationPromise`
  - Calling the action shortcut function will execute the Mutation and return a `MutationPromise`

The following is true for both the action shortcut function and the `MutationRef` function:
- The `MutationPromise` returned will resolve to the result of the Mutation once it has finished executing
- If the Mutation accepts arguments, both the action shortcut function and the `MutationRef` function accept a single argument: an object that contains all the required variables (and the optional variables) for the Mutation
- Both functions can be called with or without passing in a `DataConnect` instance as an argument. If no `DataConnect` argument is passed in, then the generated SDK will call `getDataConnect(connectorConfig)` behind the scenes for you.

Below are examples of how to use the `example` connector's generated functions to execute each mutation. You can also follow the examples from the [Data Connect documentation](https://firebase.google.com/docs/data-connect/web-sdk#using-mutations).

## AddNewMaintenanceRequest
You can execute the `AddNewMaintenanceRequest` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
addNewMaintenanceRequest(vars: AddNewMaintenanceRequestVariables): MutationPromise<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;

interface AddNewMaintenanceRequestRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: AddNewMaintenanceRequestVariables): MutationRef<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;
}
export const addNewMaintenanceRequestRef: AddNewMaintenanceRequestRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
addNewMaintenanceRequest(dc: DataConnect, vars: AddNewMaintenanceRequestVariables): MutationPromise<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;

interface AddNewMaintenanceRequestRef {
  ...
  (dc: DataConnect, vars: AddNewMaintenanceRequestVariables): MutationRef<AddNewMaintenanceRequestData, AddNewMaintenanceRequestVariables>;
}
export const addNewMaintenanceRequestRef: AddNewMaintenanceRequestRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the addNewMaintenanceRequestRef:
```typescript
const name = addNewMaintenanceRequestRef.operationName;
console.log(name);
```

### Variables
The `AddNewMaintenanceRequest` mutation requires an argument of type `AddNewMaintenanceRequestVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface AddNewMaintenanceRequestVariables {
  propertyId: UUIDString;
  tenantId: UUIDString;
  description: string;
  status: string;
  submittedAt: TimestampString;
}
```
### Return Type
Recall that executing the `AddNewMaintenanceRequest` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `AddNewMaintenanceRequestData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface AddNewMaintenanceRequestData {
  maintenanceRequest_insert: MaintenanceRequest_Key;
}
```
### Using `AddNewMaintenanceRequest`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, addNewMaintenanceRequest, AddNewMaintenanceRequestVariables } from '@dataconnect/generated';

// The `AddNewMaintenanceRequest` mutation requires an argument of type `AddNewMaintenanceRequestVariables`:
const addNewMaintenanceRequestVars: AddNewMaintenanceRequestVariables = {
  propertyId: ..., 
  tenantId: ..., 
  description: ..., 
  status: ..., 
  submittedAt: ..., 
};

// Call the `addNewMaintenanceRequest()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await addNewMaintenanceRequest(addNewMaintenanceRequestVars);
// Variables can be defined inline as well.
const { data } = await addNewMaintenanceRequest({ propertyId: ..., tenantId: ..., description: ..., status: ..., submittedAt: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await addNewMaintenanceRequest(dataConnect, addNewMaintenanceRequestVars);

console.log(data.maintenanceRequest_insert);

// Or, you can use the `Promise` API.
addNewMaintenanceRequest(addNewMaintenanceRequestVars).then((response) => {
  const data = response.data;
  console.log(data.maintenanceRequest_insert);
});
```

### Using `AddNewMaintenanceRequest`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, addNewMaintenanceRequestRef, AddNewMaintenanceRequestVariables } from '@dataconnect/generated';

// The `AddNewMaintenanceRequest` mutation requires an argument of type `AddNewMaintenanceRequestVariables`:
const addNewMaintenanceRequestVars: AddNewMaintenanceRequestVariables = {
  propertyId: ..., 
  tenantId: ..., 
  description: ..., 
  status: ..., 
  submittedAt: ..., 
};

// Call the `addNewMaintenanceRequestRef()` function to get a reference to the mutation.
const ref = addNewMaintenanceRequestRef(addNewMaintenanceRequestVars);
// Variables can be defined inline as well.
const ref = addNewMaintenanceRequestRef({ propertyId: ..., tenantId: ..., description: ..., status: ..., submittedAt: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = addNewMaintenanceRequestRef(dataConnect, addNewMaintenanceRequestVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.maintenanceRequest_insert);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.maintenanceRequest_insert);
});
```

## UpdateLeaseTerms
You can execute the `UpdateLeaseTerms` mutation using the following action shortcut function, or by calling `executeMutation()` after calling the following `MutationRef` function, both of which are defined in [dataconnect-generated/index.d.ts](./index.d.ts):
```typescript
updateLeaseTerms(vars: UpdateLeaseTermsVariables): MutationPromise<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;

interface UpdateLeaseTermsRef {
  ...
  /* Allow users to create refs without passing in DataConnect */
  (vars: UpdateLeaseTermsVariables): MutationRef<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;
}
export const updateLeaseTermsRef: UpdateLeaseTermsRef;
```
You can also pass in a `DataConnect` instance to the action shortcut function or `MutationRef` function.
```typescript
updateLeaseTerms(dc: DataConnect, vars: UpdateLeaseTermsVariables): MutationPromise<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;

interface UpdateLeaseTermsRef {
  ...
  (dc: DataConnect, vars: UpdateLeaseTermsVariables): MutationRef<UpdateLeaseTermsData, UpdateLeaseTermsVariables>;
}
export const updateLeaseTermsRef: UpdateLeaseTermsRef;
```

If you need the name of the operation without creating a ref, you can retrieve the operation name by calling the `operationName` property on the updateLeaseTermsRef:
```typescript
const name = updateLeaseTermsRef.operationName;
console.log(name);
```

### Variables
The `UpdateLeaseTerms` mutation requires an argument of type `UpdateLeaseTermsVariables`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:

```typescript
export interface UpdateLeaseTermsVariables {
  leaseId: UUIDString;
  leaseTerms: string;
}
```
### Return Type
Recall that executing the `UpdateLeaseTerms` mutation returns a `MutationPromise` that resolves to an object with a `data` property.

The `data` property is an object of type `UpdateLeaseTermsData`, which is defined in [dataconnect-generated/index.d.ts](./index.d.ts). It has the following fields:
```typescript
export interface UpdateLeaseTermsData {
  lease_update?: Lease_Key | null;
}
```
### Using `UpdateLeaseTerms`'s action shortcut function

```typescript
import { getDataConnect } from 'firebase/data-connect';
import { connectorConfig, updateLeaseTerms, UpdateLeaseTermsVariables } from '@dataconnect/generated';

// The `UpdateLeaseTerms` mutation requires an argument of type `UpdateLeaseTermsVariables`:
const updateLeaseTermsVars: UpdateLeaseTermsVariables = {
  leaseId: ..., 
  leaseTerms: ..., 
};

// Call the `updateLeaseTerms()` function to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await updateLeaseTerms(updateLeaseTermsVars);
// Variables can be defined inline as well.
const { data } = await updateLeaseTerms({ leaseId: ..., leaseTerms: ..., });

// You can also pass in a `DataConnect` instance to the action shortcut function.
const dataConnect = getDataConnect(connectorConfig);
const { data } = await updateLeaseTerms(dataConnect, updateLeaseTermsVars);

console.log(data.lease_update);

// Or, you can use the `Promise` API.
updateLeaseTerms(updateLeaseTermsVars).then((response) => {
  const data = response.data;
  console.log(data.lease_update);
});
```

### Using `UpdateLeaseTerms`'s `MutationRef` function

```typescript
import { getDataConnect, executeMutation } from 'firebase/data-connect';
import { connectorConfig, updateLeaseTermsRef, UpdateLeaseTermsVariables } from '@dataconnect/generated';

// The `UpdateLeaseTerms` mutation requires an argument of type `UpdateLeaseTermsVariables`:
const updateLeaseTermsVars: UpdateLeaseTermsVariables = {
  leaseId: ..., 
  leaseTerms: ..., 
};

// Call the `updateLeaseTermsRef()` function to get a reference to the mutation.
const ref = updateLeaseTermsRef(updateLeaseTermsVars);
// Variables can be defined inline as well.
const ref = updateLeaseTermsRef({ leaseId: ..., leaseTerms: ..., });

// You can also pass in a `DataConnect` instance to the `MutationRef` function.
const dataConnect = getDataConnect(connectorConfig);
const ref = updateLeaseTermsRef(dataConnect, updateLeaseTermsVars);

// Call `executeMutation()` on the reference to execute the mutation.
// You can use the `await` keyword to wait for the promise to resolve.
const { data } = await executeMutation(ref);

console.log(data.lease_update);

// Or, you can use the `Promise` API.
executeMutation(ref).then((response) => {
  const data = response.data;
  console.log(data.lease_update);
});
```

