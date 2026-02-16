
'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
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
import { useToast } from '@/hooks/use-toast';
import { Loader2, Upload, FileDown } from 'lucide-react';
import { bulkUpdateUnitsFromCSV } from '@/lib/data';
import { useLoading } from '@/hooks/useLoading';
import { downloadCSV } from '@/lib/utils';
import { handoverStatuses, managementStatuses, ownershipTypes, unitOrientations, unitStatuses, unitTypes } from '@/lib/types';

interface Props {
  propertyId: string;
  onUploadComplete: () => void;
}

export function UnitCsvUploader({ propertyId, onUploadComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { startLoading, stopLoading } = useLoading();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  const handleDownloadTemplate = () => {
    const templateData = [{
      UnitName: 'ExampleUnitA1',
      Status: 'vacant',
      Ownership: 'Landlord',
      UnitType: 'One Bedroom',
      UnitOrientation: 'FOREST.RD',
      ManagementStatus: 'Rented for Clients',
      HandoverStatus: 'Handed Over',
      HandoverDate: '2023-01-15',
      RentAmount: '25000',
      ServiceCharge: '3000',
      BaselineReading: '100',
    }];
    downloadCSV(templateData, 'unit_update_template.csv');
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ variant: 'destructive', title: 'No file selected' });
      return;
    }

    setIsLoading(true);
    startLoading('Processing Units CSV...');

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const { data, errors: parseErrors } = results;

        if (parseErrors.length > 0) {
          toast({
            variant: 'destructive',
            title: 'CSV Parsing Error',
            description: `Error on row ${parseErrors[0].row}: ${parseErrors[0].message}`,
          });
          setIsLoading(false);
          stopLoading();
          return;
        }

        try {
          const { updatedCount, createdCount, errors: updateErrors } = await bulkUpdateUnitsFromCSV(propertyId, data);
          if (updateErrors.length > 0) {
            toast({
              variant: 'destructive',
              title: 'CSV Import Error',
              description: (
                <div className="max-h-60 overflow-y-auto">
                    <p>There were errors in your CSV file:</p>
                    <ul className="list-disc pl-5 mt-2 text-xs">
                        {updateErrors.slice(0,5).map((e, i) => <li key={i}>{e}</li>)}
                        {updateErrors.length > 5 && <li>...and {updateErrors.length-5} more errors.</li>}
                    </ul>
                </div>
              ),
              duration: 10000
            });
          } else {
            toast({
              title: 'Upload Successful',
              description: `${createdCount} units created and ${updatedCount} units updated.`,
            });
          }
          
          onUploadComplete();
          setOpen(false);
          setFile(null);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        } catch (error: any) {
          toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: error.message || 'An error occurred while importing units.',
          });
        } finally {
          setIsLoading(false);
          stopLoading();
        }
      },
      error: (error: Error) => {
        toast({
          variant: 'destructive',
          title: 'Upload Error',
          description: error.message,
        });
        setIsLoading(false);
        stopLoading();
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Update Units via CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Bulk Process Units via CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV to create new units or update existing ones. The &apos;UnitName&apos; column is required.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} ref={fileInputRef} />
          </div>
           <Button variant="link" type="button" onClick={handleDownloadTemplate} className="justify-start p-0 h-auto">
            <FileDown className="mr-2 h-4 w-4" />
            Download CSV Template
          </Button>
        </div>
        <DialogFooter>
          <Button onClick={handleUpload} disabled={isLoading || !file}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Processing...' : 'Process CSV'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

    