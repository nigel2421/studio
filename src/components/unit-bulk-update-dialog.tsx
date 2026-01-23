
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
import { bulkUpdateUnitsFromCSV } from '@/lib/data';
import { useLoading } from '@/hooks/useLoading';
import { ScrollArea } from './ui/scroll-area';

interface Props {
  onUploadComplete: () => void;
}

export function UnitBulkUpdateDialog({ onUploadComplete }: Props) {
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
        const { data, meta } = results;

        const requiredHeaders = ['UnitName'];
        const actualHeaders = meta.fields || [];
        const missingHeaders = requiredHeaders.filter(h => !actualHeaders.includes(h));

        if (missingHeaders.length > 0) {
           toast({
            variant: 'destructive',
            title: 'CSV Header Error',
            description: `Missing required columns: ${missingHeaders.join(', ')}`,
          });
          setIsLoading(false);
          stopLoading();
          return;
        }

        try {
          const { updatedCount, errors } = await bulkUpdateUnitsFromCSV(data);
          
          if (errors.length > 0) {
            toast({
              variant: 'destructive',
              title: `Found ${errors.length} error(s) in CSV`,
              description: (
                <ScrollArea className="h-40">
                  <pre className="text-xs whitespace-pre-wrap">
                    {errors.join('\n')}
                  </pre>
                </ScrollArea>
              ),
              duration: 10000,
            });
          } else if (updatedCount > 0) {
            toast({
              title: 'Upload Successful',
              description: `${updatedCount} units have been updated.`,
            });
            onUploadComplete();
            setOpen(false);
            setFile(null);
            if (fileInputRef.current) {
              fileInputRef.current.value = '';
            }
          } else {
             toast({
              title: 'No Changes',
              description: `The CSV data matched the existing unit details. No updates were made.`,
            });
          }
        } catch (error: any) {
          toast({
            variant: 'destructive',
            title: 'Update Failed',
            description: error.message || 'An error occurred while updating the units.',
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
          Bulk Update Units
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bulk Update Units via CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV to update multiple unit details at once.
          </DialogDescription>
        </DialogHeader>
        <div className="text-left text-xs space-y-2 text-muted-foreground">
            <div>
                <h4 className="font-bold text-foreground">Required Columns:</h4>
                <ul className="list-disc list-inside">
                    <li>UnitName (must be unique across all properties)</li>
                </ul>
            </div>
            <div>
                <h4 className="font-bold text-foreground mt-2">Optional Columns:</h4>
                <ul className="list-disc list-inside">
                    <li>Status (e.g., vacant, rented, airbnb)</li>
                    <li>Ownership (SM or Landlord)</li>
                    <li>UnitType (e.g., Studio, One Bedroom)</li>
                    <li>ManagementStatus</li>
                    <li>HandoverStatus (Pending or Handed Over)</li>
                    <li>HandoverDate (YYYY-MM-DD format)</li>
                    <li>RentAmount (number only, e.g., 25000)</li>
                    <li>ServiceCharge (number only, e.g., 3000)</li>
                </ul>
            </div>
        </div>
        <div className="grid gap-4 py-4">
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="csv-file">CSV File</Label>
            <Input id="csv-file" type="file" accept=".csv" onChange={handleFileChange} ref={fileInputRef} />
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
