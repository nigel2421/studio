# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.




### React
For each operation, there is a wrapper hook that can be used to call the operation.

Here are all of the hooks that get generated:
```ts
import { useAddNewMaintenanceRequest, useGetTenantPayments, useUpdateLeaseTerms, useListProperties } from '@dataconnect/generated/react';
// The types of these hooks are available in react/index.d.ts

const { data, isPending, isSuccess, isError, error } = useAddNewMaintenanceRequest(addNewMaintenanceRequestVars);

const { data, isPending, isSuccess, isError, error } = useGetTenantPayments(getTenantPaymentsVars);

const { data, isPending, isSuccess, isError, error } = useUpdateLeaseTerms(updateLeaseTermsVars);

const { data, isPending, isSuccess, isError, error } = useListProperties();

```

Here's an example from a different generated SDK:

```ts
import { useListAllMovies } from '@dataconnect/generated/react';

function MyComponent() {
  const { isLoading, data, error } = useListAllMovies();
  if(isLoading) {
    return <div>Loading...</div>
  }
  if(error) {
    return <div> An Error Occurred: {error} </div>
  }
}

// App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MyComponent from './my-component';

function App() {
  const queryClient = new QueryClient();
  return <QueryClientProvider client={queryClient}>
    <MyComponent />
  </QueryClientProvider>
}
```



## Advanced Usage
If a user is not using a supported framework, they can use the generated SDK directly.

Here's an example of how to use it with the first 5 operations:

```js
import { addNewMaintenanceRequest, getTenantPayments, updateLeaseTerms, listProperties } from '@dataconnect/generated';


// Operation AddNewMaintenanceRequest:  For variables, look at type AddNewMaintenanceRequestVars in ../index.d.ts
const { data } = await AddNewMaintenanceRequest(dataConnect, addNewMaintenanceRequestVars);

// Operation GetTenantPayments:  For variables, look at type GetTenantPaymentsVars in ../index.d.ts
const { data } = await GetTenantPayments(dataConnect, getTenantPaymentsVars);

// Operation UpdateLeaseTerms:  For variables, look at type UpdateLeaseTermsVars in ../index.d.ts
const { data } = await UpdateLeaseTerms(dataConnect, updateLeaseTermsVars);

// Operation ListProperties: 
const { data } = await ListProperties(dataConnect);


```