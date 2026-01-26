
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

interface Props {
  onUploadComplete: () => void;
}

export function UnitCsvUploader({ onUploadComplete }: Props) {
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
          const { updatedCount, errors: updateErrors } = await bulkUpdateUnitsFromCSV(data);
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
              description: `${updatedCount} units have been updated.`,
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
          <DialogTitle>Bulk Update Units via CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV with a 'UnitName' column, plus any other columns you want to update (e.g., 'Status', 'RentAmount').
          </DialogDescription>
        </DialogHeader>
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
