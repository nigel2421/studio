
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addTenant, getTenants } from '@/lib/data';
import { agents } from '@/lib/types';
import type { Property, Unit, Agent, Tenant } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { useLoading } from '@/hooks/useLoading';
import { format } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';

const WATER_DEPOSIT_AMOUNT = 5000;

export default function AddTenantPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [availableUnits, setAvailableUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [unitName, setUnitName] = useState('');
  const [agent, setAgent] = useState<Agent>();
  const [rent, setRent] = useState(0);
  const [leaseStartDate, setLeaseStartDate] = useState<Date | undefined>();
  const [securityDeposit, setSecurityDeposit] = useState(0);


  useEffect(() => {
    async function fetchData() {
      const [props, tenantData] = await Promise.all([
        getProperties(),
        getTenants(),
      ]);
      setProperties(props);
      setTenants(tenantData);
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      const property = properties.find(p => p.id === selectedProperty);
      if (property) {
        const occupiedUnitNames = new Set(
          tenants.filter(t => t.propertyId === selectedProperty).map(t => t.unitName)
        );

        const units = property.units.filter(u => {
          if (u.status !== 'vacant' || occupiedUnitNames.has(u.name)) {
            return false;
          }
          const isSMManaged = u.ownership === 'SM';
          const isClientManaged = u.ownership === 'Landlord' &&
            u.handoverStatus === 'Handed Over' &&
            u.managementStatus === 'Rented for Clients';
          return isSMManaged || isClientManaged;
        });
        setAvailableUnits(units);
      }
    } else {
      setAvailableUnits([]);
    }
    setUnitName('');
  }, [selectedProperty, properties, tenants]);

  useEffect(() => {
    if (unitName) {
        const unit = availableUnits.find(u => u.name === unitName);
        if (unit && unit.rentAmount) {
            setRent(unit.rentAmount);
            setSecurityDeposit(unit.rentAmount); // Default security deposit to one month's rent
        } else {
            setRent(0);
            setSecurityDeposit(0);
        }
    } else {
        setRent(0);
        setSecurityDeposit(0);
    }
  }, [unitName, availableUnits]);

  const { startLoading, stopLoading } = useLoading();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || !unitName || !agent) return;
    if (!leaseStartDate) {
      toast({
        variant: "destructive",
        title: "Missing Date",
        description: "Please select a lease start date.",
      });
      return;
    }

    setIsLoading(true);
    startLoading(`Adding Tenant...`);
    try {
      await addTenant({
        name,
        email,
        phone,
        idNumber,
        propertyId: selectedProperty,
        unitName,
        agent,
        rent,
        leaseStartDate: format(leaseStartDate, 'yyyy-MM-dd'),
        securityDeposit,
        waterDeposit: WATER_DEPOSIT_AMOUNT,
        residentType: 'Tenant',
      });

      toast({
        title: `Tenant Added`,
        description: `${name} has been added and their login credentials have been created.`,
      });
      router.push('/tenants');
    } catch (error: any) {
      console.error('Error adding tenant:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to add tenant. Please try again.`,
      });
      stopLoading(); // Stop only if we don't navigate away
    } finally {
      setIsLoading(false);
      // Note: stopLoading is called by PageLoader on navigation via usePathname
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Add New Tenant</CardTitle>
        <CardDescription>Onboard a new tenant and create their system account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="idNumber">ID Number</Label>
              <Input id="idNumber" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="property">Property</Label>
              <Select onValueChange={setSelectedProperty} value={selectedProperty}>
                <SelectTrigger id="property">
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map(property => (
                    <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Select onValueChange={setUnitName} value={unitName} disabled={!selectedProperty}>
                <SelectTrigger id="unit">
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {availableUnits.filter(unit => unit.name !== '').map((unit, index) => (
                    <SelectItem key={`${unit.name}-${index}`} value={unit.name}>{unit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="agent">Agent/Point of Contact</Label>
              <Select onValueChange={(value) => setAgent(value as Agent)} value={agent}>
                <SelectTrigger id="agent">
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(agent => (
                    <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
             <div>
              <Label htmlFor="rent">Monthly Rent (Ksh)</Label>
              <Input id="rent" type="number" value={rent} onChange={(e) => setRent(Number(e.target.value))} required />
            </div>
          </div>
           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <Label htmlFor="securityDeposit">Security Deposit Amount (Ksh)</Label>
                    <Input id="securityDeposit" type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(Number(e.target.value) || 0)} />
                </div>
                <div>
                    <Label htmlFor="leaseStartDate">Lease Start Date</Label>
                    <DatePicker id="leaseStartDate" value={leaseStartDate} onChange={setLeaseStartDate} />
                </div>
            </div>

          <Button type="submit" className="w-full" disabled={!selectedProperty || !unitName || !agent || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Tenant
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
