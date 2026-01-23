import { useState, useEffect } from 'react';

// Define types locally to match the API response and avoid server-side imports.
interface Unit {
  id: string;
  name: string;
}

interface Tenant {
  id: string;
  name: string;
  email: string;
  unitId: string;
  unit?: Unit;
}

interface TenantWithArrears {
  tenant: Tenant;
  arrears: number;
}

type NotificationStatus = 'idle' | 'sending' | 'sent' | 'error';

const ArrearsPage = () => {
  const [tenantsInArrears, setTenantsInArrears] = useState<TenantWithArrears[]>([]);
  const [loading, setLoading] = useState(true);
  const [notificationStatus, setNotificationStatus] = useState<{ [tenantId: string]: NotificationStatus }>({});

  useEffect(() => {
    const fetchArrears = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/tenants/arrears');
        if (!res.ok) {
          throw new Error('Failed to fetch arrears data');
        }
        const data = await res.json();
        setTenantsInArrears(data);
        // Initialize notification status for each tenant
        const initialStatus: { [tenantId: string]: NotificationStatus } = {};
        data.forEach((item: TenantWithArrears) => {
          initialStatus[item.tenant.id] = 'idle';
        });
        setNotificationStatus(initialStatus);
      } catch (error) {
        console.error('Error fetching tenants in arrears:', error);
      }
      setLoading(false);
    };

    fetchArrears();
  }, []);

  const handleSendReminder = async (tenantId: string, arrears: number) => {
    setNotificationStatus((prev) => ({ ...prev, [tenantId]: 'sending' }));
    try {
      const res = await fetch('/api/notify/arrears', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tenantId, arrears }),
      });

      if (!res.ok) {
        throw new Error('Failed to send reminder');
      }

      setNotificationStatus((prev) => ({ ...prev, [tenantId]: 'sent' }));
      
      // Revert the status back to 'idle' after a few seconds to allow re-sending
      setTimeout(() => {
        setNotificationStatus((prev) => ({ ...prev, [tenantId]: 'idle' }));
      }, 3000);

    } catch (error) {
      console.error('Error sending reminder:', error);
      setNotificationStatus((prev) => ({ ...prev, [tenantId]: 'error' }));
    }
  };
  
  const getButtonState = (status: NotificationStatus) => {
    switch (status) {
      case 'sending':
        return { text: 'Sending...', disabled: true };
      case 'sent':
        return { text: 'Sent!', disabled: true };
      case 'error':
        return { text: 'Retry', disabled: false };
      case 'idle':
      default:
        return { text: 'Send Reminder', disabled: false };
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800">
      <div className="container mx-auto p-4 sm:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Tenants in Arrears</h1>
          <p className="text-sm text-gray-500 mt-1">
            A list of all tenants with outstanding service charge arrears.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
             <p>Loading tenants...</p>
          </div>
        ) : tenantsInArrears.length === 0 ? (
          <div className="text-center py-12 px-4 sm:px-6 lg:px-8 bg-white rounded-lg shadow">
            <h2 className="text-xl font-medium text-gray-900">All Clear!</h2>
            <p className="mt-1 text-sm text-gray-500">There are currently no tenants in arrears.</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-lg shadow">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tenant Name
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Arrears Amount
                  </th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tenantsInArrears.map(({ tenant, arrears }) => {
                  const status = notificationStatus[tenant.id] || 'idle';
                  const buttonState = getButtonState(status);
                  
                  return (
                    <tr key={tenant.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{tenant.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{tenant.unit?.name || 'N/A'}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">£{arrears.toFixed(2)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => handleSendReminder(tenant.id, arrears)}
                          disabled={buttonState.disabled}
                          className={`inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white 
                            ${buttonState.disabled ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'}
                            ${status === 'error' ? '!bg-red-600 hover:!bg-red-700' : ''}
                          `}
                        >
                          {buttonState.text}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ArrearsPage;
