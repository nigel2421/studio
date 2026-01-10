
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
import { Loader2, Upload } from 'lucide-react';
import { updateUnitTypesFromCSV } from '@/lib/data';
import { UnitType, unitTypes } from '@/lib/types';

interface CsvData {
  PropertyName: string;
  UnitName: string;
  UnitType: string;
}

interface Props {
    onUploadComplete: () => void;
}

export function UnitCsvUploader({ onUploadComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFile(event.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ variant: 'destructive', title: 'No file selected' });
      return;
    }

    setIsLoading(true);

    Papa.parse<CsvData>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const { data, errors } = results;

        if (errors.length > 0) {
          toast({
            variant: 'destructive',
            title: 'CSV Parsing Error',
            description: `Error on row ${errors[0].row}: ${errors[0].message}`,
          });
          setIsLoading(false);
          return;
        }
        
        const validUnitTypes = new Set(unitTypes);
        const invalidRow = data.find(row => !validUnitTypes.has(row.UnitType as UnitType));

        if (invalidRow) {
            toast({
                variant: 'destructive',
                title: 'Invalid Unit Type',
                description: `Row for unit "${invalidRow.UnitName}" has an invalid UnitType: "${invalidRow.UnitType}".`,
            });
            setIsLoading(false);
            return;
        }

        try {
          const updatedCount = await updateUnitTypesFromCSV(data);
          toast({
            title: 'Upload Successful',
            description: `${updatedCount} unit types have been updated.`,
          });
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
            description: error.message || 'An error occurred while updating the units.',
          });
        } finally {
          setIsLoading(false);
        }
      },
      error: (error: Error) => {
        toast({
          variant: 'destructive',
          title: 'Upload Error',
          description: error.message,
        });
        setIsLoading(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="mr-2 h-4 w-4" />
          Upload CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Unit Types via CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <strong>PropertyName</strong>, <strong>UnitName</strong>, and <strong>UnitType</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} ref={fileInputRef} />
            <p className="text-sm text-muted-foreground">
              Ensure headers match exactly.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleUpload} disabled={isLoading || !file}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isLoading ? 'Processing...' : 'Upload and Update'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
