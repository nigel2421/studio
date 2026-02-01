import { FinancialDocument } from "@/lib/types";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, FileText, Droplets, Banknote, Calendar } from "lucide-react";

interface DocumentCardProps {
    document: FinancialDocument;
    onDownload: (doc: FinancialDocument) => void;
}

export function DocumentCard({ document, onDownload }: DocumentCardProps) {
    const getIcon = () => {
        switch (document.type) {
            case 'Rent Receipt': return <Banknote className="h-5 w-5 text-green-600" />;
            case 'Water Bill': return <Droplets className="h-5 w-5 text-blue-600" />;
            case 'Service Charge': return <FileText className="h-5 w-5 text-amber-600" />;
            default: return <FileText className="h-5 w-5 text-gray-600" />;
        }
    };

    const getStatusColor = () => {
        switch (document.status) {
            case 'Paid': return 'bg-green-100 text-green-700 hover:bg-green-100';
            case 'Pending': return 'bg-amber-100 text-amber-700 hover:bg-amber-100';
            case 'Overdue': return 'bg-red-100 text-red-700 hover:bg-red-100';
            default: return 'bg-gray-100 text-gray-700 hover:bg-gray-100';
        }
    };

    return (
        <Card className="overflow-hidden hover:shadow-md transition-shadow duration-200 border-l-4" style={{
            borderLeftColor: document.type === 'Rent Receipt' ? '#16a34a' :
                document.type === 'Water Bill' ? '#2563eb' :
                    '#d97706'
        }}>
            <CardContent className="p-4 grid gap-3">
                <div className="flex justify-between items-start">
                    <div className="flex gap-3">
                        <div className="p-2 bg-muted/30 rounded-full h-fit">
                            {getIcon()}
                        </div>
                        <div>
                            <h4 className="font-bold text-sm line-clamp-1">{document.title}</h4>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1">
                                <Calendar className="h-3 w-3" />
                                {new Date(document.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                            </div>
                        </div>
                    </div>
                    <Badge className={`text-[10px] font-bold shadow-none ${getStatusColor()}`}>
                        {document.status}
                    </Badge>
                </div>

                <div className="flex items-end justify-between mt-2">
                    <div className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Amount</div>
                    <div className="text-lg font-bold">KSh {document.amount.toLocaleString()}</div>
                </div>
            </CardContent>
            <CardFooter className="p-2 bg-muted/10 border-t flex justify-end">
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs font-medium hover:bg-background hover:text-primary w-full sm:w-auto"
                    onClick={() => onDownload(document)}
                >
                    <Download className="mr-2 h-3.5 w-3.5" />
                    Download PDF
                </Button>
            </CardFooter>
        </Card>
    );
}
