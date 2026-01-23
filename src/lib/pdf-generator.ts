
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FinancialDocument, WaterMeterReading, Payment, ServiceChargeStatement, Landlord, FinancialSummary, Unit, Property, PropertyOwner, Tenant } from '@/lib/types';
import { format } from 'date-fns';

// Helper to add company header
const addHeader = (doc: jsPDF, title: string) => {
    doc.setTextColor(40);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Eracov Properties', 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Mombasa Road, Nairobi', 14, 26);
    doc.text('Phone: +254 700 000 000', 14, 30);
    doc.text('Email: management@eracov.com', 14, 34);

    // Document Title
    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102); // Dark blue
    doc.text(title.toUpperCase(), 196, 20, { align: 'right' });

    // Line separator
    doc.setDrawColor(200);
    doc.line(14, 40, 196, 40);
};

// Helper for currency formatting
const formatCurrency = (amount: number) => `KSh ${amount.toLocaleString()}`;

export const generateDocumentPDF = (document: FinancialDocument) => {
    const doc = new jsPDF();

    if (document.type === 'Rent Receipt') {
        generateRentReceipt(doc, document);
    } else if (document.type === 'Water Bill') {
        generateWaterBill(doc, document);
    } else if (document.type === 'Service Charge') {
        generateServiceCharge(doc, document);
    }

    // Save the PDF
    doc.save(`${document.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`);
};

const generateRentReceipt = (doc: jsPDF, document: FinancialDocument) => {
    addHeader(doc, 'Rent Receipt');

    const payment = document.sourceData as Payment;
    const dateStr = new Date(payment.date).toLocaleDateString();

    doc.setFontSize(10);
    doc.setTextColor(0);

    doc.text(`Receipt No: #${payment.id.substring(0, 8).toUpperCase()}`, 14, 50);
    doc.text(`Date: ${dateStr}`, 14, 56);
    doc.text(`Status: ${document.status}`, 14, 62);

    autoTable(doc, {
        startY: 70,
        head: [['Description', 'Amount']],
        body: [
            ['Rent Payment', formatCurrency(payment.amount)],
        ],
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] }, // Green
        foot: [['TOTAL PAID', formatCurrency(payment.amount)]],
        footStyles: { fillColor: [240, 253, 244], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.text('Thank you for your payment.', 14, (doc as any).lastAutoTable.finalY + 20);
};

const generateWaterBill = (doc: jsPDF, document: FinancialDocument) => {
    addHeader(doc, 'Water Bill');

    const reading = document.sourceData as WaterMeterReading;
    const dateStr = new Date(reading.date).toLocaleDateString();

    doc.text(`Bill No: #${reading.id.substring(0, 8).toUpperCase()}`, 14, 50);
    doc.text(`Date: ${dateStr}`, 14, 56);
    doc.text(`Unit: ${reading.unitName}`, 14, 62);

    autoTable(doc, {
        startY: 70,
        head: [['Item', 'Usage / Rate', 'Amount']],
        body: [
            ['Previous Reading', `${reading.priorReading} units`, '-'],
            ['Current Reading', `${reading.currentReading} units`, '-'],
            ['Consumption', `${reading.consumption} units`, '-'],
            ['Rate per Unit', formatCurrency(reading.rate), '-'],
            ['Total Cost', '', formatCurrency(reading.amount)],
        ],
        theme: 'grid',
        headStyles: { fillColor: [37, 99, 235] }, // Blue
        foot: [['TOTAL PAYABLE', '', formatCurrency(reading.amount)]],
        footStyles: { fillColor: [239, 246, 255], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.text('Please pay by M-Pesa or Bank Transfer.', 14, (doc as any).lastAutoTable.finalY + 20);
};

const generateServiceCharge = (doc: jsPDF, document: FinancialDocument) => {
    addHeader(doc, 'Service Charge Statement');

    const stmt = document.sourceData as ServiceChargeStatement;
    const dateStr = new Date(stmt.date).toLocaleDateString();

    doc.text(`Ref No: #${stmt.id.substring(0, 8).toUpperCase()}`, 14, 50);
    doc.text(`Date: ${dateStr}`, 14, 56);
    doc.text(`Period: ${stmt.period}`, 14, 62);

    const tableBody = stmt.items.map(item => [item.description, formatCurrency(item.amount)]);

    autoTable(doc, {
        startY: 70,
        head: [['Description', 'Amount']],
        body: tableBody,
        theme: 'plain',
        headStyles: { fillColor: [217, 119, 6] }, // Amber
        foot: [['TOTAL', formatCurrency(stmt.amount)]],
        footStyles: { fillColor: [255, 251, 235], textColor: [0, 0, 0], fontStyle: 'bold', halign: 'right' },
        columnStyles: { 1: { halign: 'right' } }
    });

    doc.text('This statement is for your records.', 14, (doc as any).lastAutoTable.finalY + 20);
};

export const generateOwnerServiceChargeStatementPDF = (
    owner: PropertyOwner,
    payments: { date: string; property: string; unit: string; amount: number }[]
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    addHeader(doc, 'Service Charge Statement');
    
    // Owner Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 196, 48, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.email, 196, 54, { align: 'right' });
    doc.text(`Date Issued: ${dateStr}`, 196, 60, { align: 'right' });

    autoTable(doc, {
        startY: 70,
        head: [['Date', 'Property', 'Unit', 'Amount Paid']],
        body: payments.map(p => [
            new Date(p.date).toLocaleDateString(),
            p.property,
            p.unit,
            formatCurrency(p.amount)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6] }, // Amber
        columnStyles: {
            3: { halign: 'right' }
        }
    });

    doc.save(`service_charge_statement_${owner.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};


export const generateLandlordStatementPDF = (
    landlord: Landlord,
    summary: FinancialSummary,
    transactions: { date: string; unit: string; gross: number; serviceCharge: number; mgmtFee: number; net: number, rentForMonth?: string }[],
    units: { property: string; unitName: string; unitType: string; status: string }[],
    startDate?: Date,
    endDate?: Date
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    // Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text('Eracov Properties', 14, 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text('Landlord Statement', 14, 26);

    // Landlord Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(landlord.name, 196, 20, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Date Issued: ${dateStr}`, 196, 26, { align: 'right' });
    
    if (startDate && endDate) {
        const periodStr = `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
        doc.text(`Period: ${periodStr}`, 196, 31, { align: 'right' });
    }

    doc.setDrawColor(200);
    doc.line(14, 35, 196, 35);

    // Summary Section
    let yPos = 45;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', 14, yPos);
    yPos += 8;

    const summaryData = [
        ['Total Revenue (from Occupied Units)', formatCurrency(summary.totalRevenue)],
        ['Service Charges (from Occupied Units)', `-${formatCurrency(summary.totalServiceCharges)}`],
        ['Management Fees (5%)', `-${formatCurrency(summary.totalManagementFees)}`],
    ];

    if (summary.vacantUnitServiceChargeDeduction && summary.vacantUnitServiceChargeDeduction > 0) {
      summaryData.push(['Service Charges (from Vacant Units)', `-${formatCurrency(summary.vacantUnitServiceChargeDeduction)}`])
    }

    summaryData.push(['Net Rent Payout', formatCurrency(summary.totalNetRemittance)]);

    autoTable(doc, {
        startY: yPos,
        body: summaryData,
        theme: 'plain',
        styles: { fontSize: 10 },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    // Transaction History
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction History', 14, yPos);
    yPos += 8;
    
    const totals = transactions.reduce((acc, t) => {
        acc.gross += t.gross;
        acc.serviceCharge += t.serviceCharge;
        acc.mgmtFee += t.mgmtFee;
        acc.net += t.net;
        return acc;
    }, { gross: 0, serviceCharge: 0, mgmtFee: 0, net: 0 });

    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Unit', 'For Month', 'Gross', 'S. Charge', 'Mgmt Fee', 'Net']],
        body: transactions.map(t => [
            t.date,
            t.unit,
            t.rentForMonth ? format(new Date(t.rentForMonth + '-02'), 'MMM yyyy') : 'N/A',
            formatCurrency(t.gross),
            `-${formatCurrency(t.serviceCharge)}`,
            `-${formatCurrency(t.mgmtFee)}`,
            formatCurrency(t.net),
        ]),
        foot: [[
            { content: 'Totals', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(totals.gross), styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(totals.serviceCharge)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(totals.mgmtFee)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(totals.net), styles: { fontStyle: 'bold', halign: 'right' } }
        ]],
        footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0] },
        theme: 'striped',
        headStyles: { fillColor: [41, 102, 182] },
        columnStyles: {
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right' },
        },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;
    
    // Units Overview
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Unit Portfolio', 14, yPos);
    yPos += 8;

    autoTable(doc, {
        startY: yPos,
        head: [['Property', 'Unit Name', 'Unit Type', 'Status']],
        body: units.map(u => [u.property, u.unitName, u.unitType, u.status]),
        theme: 'grid',
        headStyles: { fillColor: [41, 102, 182] },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    if (summary.vacantUnitServiceChargeDeduction && summary.vacantUnitServiceChargeDeduction > 0) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100);
        doc.text(
            `Note: A deduction of ${formatCurrency(summary.vacantUnitServiceChargeDeduction)} has been made for service charges on your vacant units.`,
            14,
            yPos
        );
        yPos += 10;
    }


    doc.save(`landlord_statement_${landlord.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateTenantStatementPDF = (tenant: Tenant, payments: Payment[]) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    addHeader(doc, 'Tenant Statement');

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(tenant.name, 196, 48, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Unit: ${tenant.unitName}`, 196, 54, { align: 'right' });
    doc.text(`Date Issued: ${dateStr}`, 196, 60, { align: 'right' });

    autoTable(doc, {
        startY: 70,
        head: [['Date', 'Type', 'For Month', 'Notes', 'Amount Paid']],
        body: payments.map(p => [
            new Date(p.date).toLocaleDateString(),
            p.type || 'Rent',
            p.rentForMonth ? format(new Date(p.rentForMonth + '-02'), 'MMM yyyy') : 'N/A',
            p.notes || '',
            formatCurrency(p.amount)
        ]),
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        columnStyles: {
            4: { halign: 'right' }
        }
    });
    
    let finalY = (doc as any).lastAutoTable.finalY + 15;

    const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Paid:', 140, finalY, { align: 'right' });
    doc.text(formatCurrency(totalPaid), 196, finalY, { align: 'right' });

    doc.save(`statement_${tenant.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateVacantServiceChargeInvoicePDF = (
    owner: PropertyOwner,
    unit: Unit,
    property: Property,
    arrears: { month: string, amount: number }[]
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    addHeader(doc, 'Service Charge Invoice');
    
    // Owner Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 196, 48, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.email, 196, 54, { align: 'right' });
    doc.text(`Invoice Date: ${dateStr}`, 196, 60, { align: 'right' });
    
    // Property and Unit Details
    let yPos = 70;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice For:', 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(`Property: ${property.name}`, 14, yPos + 6);
    doc.text(`Unit: ${unit.name}`, 14, yPos + 11);
    doc.text(`Handover Date: ${unit.handoverDate ? new Date(unit.handoverDate).toLocaleDateString() : 'N/A'}`, 14, yPos + 16);
    yPos += 25;

    const totalAmount = arrears.reduce((sum, item) => sum + item.amount, 0);

    autoTable(doc, {
        startY: yPos,
        head: [['Month', 'Description', 'Amount']],
        body: arrears.map(item => [item.month, `Service Charge for Vacant Unit`, formatCurrency(item.amount)]),
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6] }, // Amber
        foot: [['TOTAL DUE', '', formatCurrency(totalAmount)]],
        footStyles: { fillColor: [255, 251, 235], textColor: [0, 0, 0], fontStyle: 'bold' },
        columnStyles: {
            2: { halign: 'right' }
        }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
    doc.text('Please remit payment at your earliest convenience to avoid further penalties.', 14, yPos);

    doc.save(`invoice_vacant_sc_${owner.name.replace(/ /g, '_')}_${unit.name}_${new Date().toISOString().split('T')[0]}.pdf`);
};
