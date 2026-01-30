'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Loader2 } from 'lucide-react';
import { Landlord, PropertyOwner } from '@/lib/types';
import { startOfYear } from 'date-fns';
import { DatePicker } from '@/components/ui/date-picker';

interface StatementOptionsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    landlord: Landlord | PropertyOwner | null;
    onGenerate: (landlord: Landlord | PropertyOwner, startDate: Date, endDate: Date) => void;
    isGenerating: boolean;
}

export function StatementOptionsDialog({ isOpen, onClose, landlord, onGenerate, isGenerating }: StatementOptionsDialogProps) {
    const [startDate, setStartDate] = useState<Date | undefined>(startOfYear(new Date()));
    const [endDate, setEndDate] = useState<Date | undefined>(new Date());

    if (!landlord) {
        return null;
    }

    const handleGenerateClick = () => {
        if (landlord && startDate && endDate) {
            onGenerate(landlord, startDate, endDate);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>Generate Statement for {landlord.name}</DialogTitle>
                    <DialogDescription>
                        Select the date range for the financial statement.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label htmlFor="start-date">Start Date</Label>
                            <DatePicker value={startDate} onChange={setStartDate} />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end-date">End Date</Label>
                            <DatePicker value={endDate} onChange={setEndDate} />
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleGenerateClick} disabled={isGenerating || !startDate || !endDate}>
                        {isGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Generate PDF
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
