'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getProperties, addTenant } from '@/lib/data';
import { agents } from '@/lib/types';
import type { Property, Unit, Agent } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { FilePlus2, Loader2 } from 'lucide-react';

interface AddTenantDialogProps {
  onTenantAdded: () => void;
}

export function AddTenantDialog({ onTenantAdded }: AddTenantDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>('');
  const [vacantUnits, setVacantUnits] = useState<Unit[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [unitName, setUnitName] = useState('');
  const [agent, setAgent] = useState<Agent>();
  const [rent, setRent] = useState(0);
  const [securityDeposit, setSecurityDeposit] = useState(0);

  useEffect(() => {
    if (open) {
      async function fetchProperties() {
        const props = await getProperties();
        setProperties(props);
      }
      fetchProperties();
    }
  }, [open]);

  useEffect(() => {
    if (selectedProperty) {
      const property = properties.find(p => p.id === selectedProperty);
      if (property) {
        setVacantUnits(property.units.filter(u => u.status === 'vacant'));
      }
    } else {
      setVacantUnits([]);
    }
    setUnitName('');
  }, [selectedProperty, properties]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPhone('');
    setIdNumber('');
    setSelectedProperty('');
    setUnitName('');
    setAgent(undefined);
    setRent(0);
    setSecurityDeposit(0);
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProperty || !unitName || !agent) return;

    setIsLoading(true);
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
        securityDeposit,
      });
      toast({
        title: "Tenant Added",
        description: `${name} has been added and their login credentials have been created.`,
      });
      onTenantAdded();
      resetForm();
      setOpen(false);
    } catch (error) {
      console.error('Error adding tenant:', error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to add tenant. Please try again.",
      });
    } finally {
        setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
            <Button size="sm">
                <FilePlus2 className="mr-2 h-4 w-4" />
                New Tenant
            </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
                <DialogTitle>Add New Tenant</DialogTitle>
                <DialogDescription>
                    Fill in the details below to add a new tenant and create their login credentials.
                </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit}>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name-dialog">Full Name</Label>
                    <Input id="name-dialog" value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                  <div>
                    <Label htmlFor="email-dialog">Email</Label>
                    <Input id="email-dialog" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                      <Label htmlFor="phone-dialog">Phone Number</Label>
                      <Input id="phone-dialog" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  </div>
                  <div>
                      <Label htmlFor="idNumber-dialog">ID Number</Label>
                      <Input id="idNumber-dialog" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                      <Label htmlFor="property-dialog">Property</Label>
                      <Select onValueChange={setSelectedProperty} value={selectedProperty}>
                          <SelectTrigger id="property-dialog">
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
                      <Label htmlFor="unit-dialog">Unit</Label>
                      <Select onValueChange={setUnitName} value={unitName} disabled={!selectedProperty}>
                          <SelectTrigger id="unit-dialog">
                              <SelectValue placeholder="Select a unit" />
                          </SelectTrigger>
                          <SelectContent>
                              {vacantUnits.filter(unit => unit.name !== '').map((unit, index) => (
                                  <SelectItem key={`${unit.name}-${index}`} value={unit.name}>{unit.name}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="agent-dialog">Agent</Label>
                      <Select onValueChange={(value) => setAgent(value as Agent)} value={agent}>
                          <SelectTrigger id="agent-dialog">
                              <SelectValue placeholder="Select an agent" />
                          </SelectTrigger>
                          <SelectContent>
                              {agents.map(agent => (
                                  <SelectItem key={agent} value={agent}>{agent}</SelectItem>
                              ))}
                          </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label htmlFor="rent-dialog">Rent Amount (Ksh)</Label>
                      <Input id="rent-dialog" type="number" value={rent} onChange={(e) => setRent(Number(e.target.value))} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="securityDeposit-dialog">Security Deposit (Ksh)</Label>
                      <Input id="securityDeposit-dialog" type="number" value={securityDeposit} onChange={(e) => setSecurityDeposit(Number(e.target.value))} required />
                    </div>
                </div>
              </div>
              <DialogFooter>
                  <Button type="submit" disabled={!selectedProperty || !unitName || !agent || isLoading}>
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Add Tenant
                  </Button>
              </DialogFooter>
            </form>
        </DialogContent>
    </Dialog>
  );
}
