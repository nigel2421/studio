
'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Calendar as CalendarIcon, Loader2 } from 'lucide-react';
import { Landlord } from '@/lib/types';
import { cn } from '@/lib/utils';
import { format, startOfYear } from 'date-fns';

interface StatementOptionsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    landlord: Landlord | null;
    onGenerate: (landlord: Landlord, startDate: Date, endDate: Date) => void;
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
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="start-date"
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !startDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {startDate ? format(startDate, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={startDate}
                                        onSelect={setStartDate}
                                    />
                                </PopoverContent>
                            </Popover>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="end-date">End Date</Label>
                            <Popover>
                                <PopoverTrigger asChild>
                                    <Button
                                        id="end-date"
                                        variant={"outline"}
                                        className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !endDate && "text-muted-foreground"
                                        )}
                                    >
                                        <CalendarIcon className="mr-2 h-4 w-4" />
                                        {endDate ? format(endDate, "PPP") : <span>Pick a date</span>}
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0">
                                    <Calendar
                                        mode="single"
                                        selected={endDate}
                                        onSelect={setEndDate}
                                        disabled={startDate ? { before: startDate } : undefined}
                                    />
                                </PopoverContent>
                            </Popover>
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
