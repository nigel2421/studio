'use client';

import * as React from 'react';
import { format, parse, isValid } from 'date-fns';
import { Calendar as CalendarIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

interface DatePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  className?: string;
  disabled?: boolean;
}

const DATE_FORMAT = "d MMMM yyyy";

export function DatePicker({
  value,
  onChange,
  className,
  disabled,
}: DatePickerProps) {
    const [inputValue, setInputValue] = React.useState('');
    const [popoverOpen, setPopoverOpen] = React.useState(false);
    
    React.useEffect(() => {
        if (value && isValid(value)) {
            setInputValue(format(value, DATE_FORMAT));
        } else {
            setInputValue('');
        }
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const textValue = e.target.value;
        setInputValue(textValue);
    };
    
    const handleInputBlur = () => {
        const parsedDate = parse(inputValue, DATE_FORMAT, new Date());
        if (isValid(parsedDate)) {
            if (!value || value.getTime() !== parsedDate.getTime()) {
                onChange(parsedDate);
            }
        } else {
            if(inputValue === '') {
                onChange(undefined);
            } else {
                setInputValue(value && isValid(value) ? format(value, DATE_FORMAT) : '');
            }
        }
    };
    
    const handleDaySelect = (date: Date | undefined) => {
        onChange(date);
        setPopoverOpen(false);
    }

  return (
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen} modal={true}>
      <div className={cn('relative w-full', className)}>
        <Input
          type="text"
          placeholder={DATE_FORMAT.toLowerCase()}
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          className="pr-10"
          disabled={disabled}
        />
        <PopoverTrigger asChild>
            <Button
                variant={'ghost'}
                className={cn(
                    'absolute top-1/2 right-0.5 h-8 w-8 -translate-y-1/2 p-0 font-normal',
                    !value && 'text-muted-foreground'
                )}
                disabled={disabled}
                type="button"
            >
                <CalendarIcon className="h-4 w-4" />
                <span className="sr-only">Open calendar</span>
            </Button>
        </PopoverTrigger>
      </div>
      <PopoverContent className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDaySelect}
          initialFocus
          fromYear={new Date().getFullYear() - 40}
          toYear={new Date().getFullYear() + 10}
          captionLayout="dropdown"
        />
      </PopoverContent>
    </Popover>
  );
}
