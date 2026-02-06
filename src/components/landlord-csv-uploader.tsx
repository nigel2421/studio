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
import { addLandlordsFromCSV } from '@/lib/data';
import { useLoading } from '@/hooks/useLoading';
import { downloadCSV } from '@/lib/utils';

interface CsvData {
  name: string;
  email: string;
  phone: string;
  bankAccount?: string;
}

interface Props {
  onUploadComplete: () => void;
}

export function LandlordCsvUploader({ onUploadComplete }: Props) {
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
      name: 'John Doe',
      email: 'john.doe@example.com',
      phone: '254712345678',
    }];
    downloadCSV(templateData, 'landlord_upload_template.csv');
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ variant: 'destructive', title: 'No file selected' });
      return;
    }

    setIsLoading(true);
    startLoading('Processing Landlord CSV...');

    Papa.parse<CsvData>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const { data, errors, meta } = results;

        const requiredHeaders = ['name', 'email', 'phone'];
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

        if (errors.length > 0) {
          toast({
            variant: 'destructive',
            title: 'CSV Parsing Error',
            description: `Error on row ${errors[0].row}: ${errors[0].message}`,
          });
          setIsLoading(false);
          stopLoading();
          return;
        }

        try {
          const { added, skipped } = await addLandlordsFromCSV(data);
          toast({
            title: 'Upload Successful',
            description: `${added} new landlords added. ${skipped} duplicates were skipped.`,
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
            description: error.message || 'An error occurred while importing landlords.',
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
          Upload Landlords CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Bulk Upload Landlords</DialogTitle>
          <DialogDescription>
            Upload a CSV with columns: <strong>name</strong>, <strong>email</strong>, and <strong>phone</strong>. Existing landlords (by email) will be skipped.
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
            {isLoading ? 'Processing...' : 'Upload and Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
