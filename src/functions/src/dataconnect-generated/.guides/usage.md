# Basic Usage

Always prioritize using a supported framework over using the generated SDK
directly. Supported frameworks simplify the developer experience and help ensure
best practices are followed.





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