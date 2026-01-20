'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addTenant } from '@/lib/data';
import { agents } from '@/lib/types';
import type { Property, Unit, Agent } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useLoading } from '@/hooks/useLoading';

export default function AddTenantPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [vacantUnits, setVacantUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [unitName, setUnitName] = useState('');
  const [residentType, setResidentType] = useState<'Tenant' | 'Homeowner'>('Tenant');
  const [agent, setAgent] = useState<Agent>();
  const [rent, setRent] = useState(0);
  const [securityDeposit, setSecurityDeposit] = useState(0);
  const [bookedWithDeposit, setBookedWithDeposit] = useState(false);

  useEffect(() => {
    async function fetchProperties() {
      const props = await getProperties();
      setProperties(props);
    }
    fetchProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      const property = properties.find(p => p.id === selectedProperty);
      if (property) {
        const availableUnits = property.units.filter(u =>
          u.status === 'vacant' &&
          (u.managementStatus === 'Renting Mngd by Eracov for SM' || u.managementStatus === 'Renting Mngd by Eracov for Client')
        );
        setVacantUnits(availableUnits);
      }
    } else {
      setVacantUnits([]);
    }
    setUnitName('');
  }, [selectedProperty, properties]);

  const { startLoading, stopLoading } = useLoading();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || !unitName || !agent) return;

    setIsLoading(true);
    startLoading(`Adding ${residentType}...`);
    try {
      await addTenant({
        name,
        email,
        phone,
        idNumber,
        propertyId: selectedProperty,
        unitName,
        agent,
        rent: residentType === 'Tenant' ? rent : 0,
        securityDeposit: bookedWithDeposit ? securityDeposit : 0,
        residentType,
      } as any);

      toast({
        title: `${residentType === 'Tenant' ? 'Tenant' : 'Homeowner'} Added`,
        description: `${name} has been added and their login credentials have been created.`,
      });
      router.push('/tenants');
    } catch (error) {
      console.error('Error adding occupant:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: `Failed to add ${residentType.toLowerCase()}. Please try again.`,
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
        <CardTitle>Add New Tenant / Homeowner</CardTitle>
        <CardDescription>Onboard a new long-term occupant and create their system account.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="residentType">Occupant Type</Label>
              <Select onValueChange={(v) => setResidentType(v as any)} value={residentType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Tenant">Tenant (Pays Rent)</SelectItem>
                  <SelectItem value="Homeowner">Homeowner (Pays Service Charge)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="phone">Phone Number</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="idNumber">ID Number</Label>
              <Input id="idNumber" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="property">Property</Label>
              <Select onValueChange={setSelectedProperty} value={selectedProperty}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map(property => (
                    <SelectItem key={property.id} value={property.id}>{property.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="unit">Unit</Label>
              <Select onValueChange={setUnitName} value={unitName} disabled={!selectedProperty}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a unit" />
                </SelectTrigger>
                <SelectContent>
                  {vacantUnits.filter(unit => unit.name !== '').map((unit, index) => (
                    <SelectItem key={`${unit.name}-${index}`} value={unit.name}>{unit.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="agent">Agent/Point of Contact</Label>
              <Select onValueChange={(value) => setAgent(value as Agent)} value={agent}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a contact" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map(agent => (
                    <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rent">{residentType === 'Tenant' ? 'Monthly Rent (Ksh)' : 'Monthly Service Charge (Ksh)'}</Label>
              <Input id="rent" type="number" value={rent} onChange={(e) => setRent(Number(e.target.value))} required />
            </div>
            <div className="flex items-center space-x-2 pt-6">
              <Checkbox id="bookedWithDeposit" checked={bookedWithDeposit} onCheckedChange={(checked) => setBookedWithDeposit(Boolean(checked))} />
              <Label htmlFor="bookedWithDeposit">{residentType === 'Tenant' ? 'Booked with deposit' : 'Initial service charge paid'}</Label>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 items-center">
            <div />
            {bookedWithDeposit && (
              <div>
                <Label htmlFor="securityDeposit">Amount (Ksh)</Label>
                <Input id="securityDeposit" type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(Number(e.target.value))} required={bookedWithDeposit} />
              </div>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={!selectedProperty || !unitName || !agent || isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save {residentType === 'Tenant' ? 'Tenant' : 'Homeowner'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
