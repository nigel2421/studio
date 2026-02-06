
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { FinancialDocument, WaterMeterReading, Payment, ServiceChargeStatement, Landlord, Unit, Property, PropertyOwner, Tenant } from '@/lib/types';
import { FinancialSummary, calculateTransactionBreakdown } from '@/lib/financial-utils';
import { format, parseISO, isValid } from 'date-fns';
import { generateLedger } from './financial-logic';

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
const formatCurrency = (amount: number) => `KSh ${(amount || 0).toLocaleString()}`;

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

    let yPos = 50;
    doc.text(`Receipt No: #${payment.id.substring(0, 8).toUpperCase()}`, 14, yPos);
    yPos += 6;
    doc.text(`Date: ${dateStr}`, 14, yPos);
    yPos += 6;

    if (payment.paymentMethod) {
        doc.text(`Payment Method: ${payment.paymentMethod}`, 14, yPos);
        yPos += 6;
    }
    if (payment.transactionId) {
        doc.text(`Transaction ID: ${payment.transactionId}`, 14, yPos);
        yPos += 6;
    }

    doc.text(`Status: ${document.status}`, 14, yPos);
    yPos += 8;


    autoTable(doc, {
        startY: yPos,
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
    owner: PropertyOwner | Landlord,
    allProperties: Property[],
    allTenants: Tenant[],
    allPayments: Payment[],
    allWaterReadings: WaterMeterReading[],
    startDate: Date,
    endDate: Date,
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    addHeader(doc, 'Resident Statement');

    const ownerUnits = allProperties.flatMap(p =>
        p.units
            .filter(u => 'assignedUnits' in owner ? owner.assignedUnits.some(au => au.propertyId === p.id && au.unitNames.includes(u.name)) : u.landlordId === owner.id)
            .map(u => ({ ...u, propertyId: p.id, propertyName: p.name }))
    );

    // Header Section - Left Side
    let yPosHeader = 48;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Your Units:', 14, yPosHeader);
    yPosHeader += 6;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    ownerUnits.forEach(unit => {
        const unitDetails = `- ${unit.name} (${unit.unitType}): Service Charge ${formatCurrency(unit.serviceCharge || 0)}/mo`;
        doc.text(unitDetails, 14, yPosHeader);
        yPosHeader += 5;
    });

    // Header Section - Right Side
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 196, 48, { align: 'right' });
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.email, 196, 54, { align: 'right' });
    doc.text(`Date Issued: ${dateStr}`, 196, 60, { align: 'right' });
    const periodStr = `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
    doc.text(`Period: ${periodStr}`, 196, 66, { align: 'right' });

    const tenant = allTenants.find(t => 
        t.residentType === 'Homeowner' && 
        (t.userId === owner.userId || t.email === owner.email)
    );
    
    if (!tenant) {
        doc.text("Could not find an associated resident account for this owner.", 14, yPosHeader + 10);
        doc.save(`service_charge_statement_error_${owner.name.replace(/ /g, '_')}.pdf`);
        return;
    }

    const tenantPayments = allPayments.filter(p => p.tenantId === tenant.id);
    const tenantWaterReadings = allWaterReadings.filter(r => r.tenantId === tenant.id);

    const { ledger: serviceChargeLedger, finalDueBalance: serviceChargeDue, finalAccountBalance: serviceChargeCredit } = generateLedger(tenant, tenantPayments, allProperties, [], owner, undefined, { includeWater: false, includeRent: false, includeServiceCharge: true });
    
    const { ledger: waterLedger, finalDueBalance: waterDue, finalAccountBalance: waterCredit } = generateLedger(tenant, tenantPayments, allProperties, tenantWaterReadings, owner, undefined, { includeRent: false, includeServiceCharge: false, includeWater: true });

    let yPos = Math.max(yPosHeader, 80);

    // --- Service Charge Section ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Service Charge Statement', 14, yPos);
    yPos += 2;

    const serviceChargeTableBody = serviceChargeLedger
        .filter(entry => {
            try {
                const entryDate = parseISO(entry.date);
                return isValid(entryDate) && entryDate >= startDate && entryDate <= endDate;
            } catch {
                return false;
            }
        })
        .map(t => [
        t.date,
        t.forMonth || '',
        t.description,
        t.charge > 0 ? formatCurrency(t.charge) : '',
        t.payment > 0 ? formatCurrency(t.payment) : '',
        t.balance < 0 ? `${formatCurrency(Math.abs(t.balance))} Cr` : formatCurrency(t.balance)
    ]);

    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'For Month', 'Description', 'Charge', 'Payment', 'Balance']],
        body: serviceChargeTableBody,
        theme: 'striped',
        headStyles: { fillColor: [51, 65, 85] },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Service Charge Balance:', 140, yPos);
    doc.text(serviceChargeDue > 0 ? formatCurrency(serviceChargeDue) : `${formatCurrency(serviceChargeCredit)} Cr`, 196, yPos, { align: 'right' });
    yPos += 10;

    if (yPos > 240) {
        doc.addPage();
        yPos = 20;
    }

    // --- Water Bill Section ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Water Bill Statement', 14, yPos);
    yPos += 2;

    const waterTableBody = waterLedger
        .filter(entry => {
            try {
                const entryDate = parseISO(entry.date);
                return isValid(entryDate) && entryDate >= startDate && entryDate <= endDate;
            } catch {
                return false;
            }
        })
        .map(t => [
        t.date,
        t.forMonth || '',
        t.description,
        t.charge > 0 ? formatCurrency(t.charge) : '',
        t.payment > 0 ? formatCurrency(t.payment) : '',
        t.balance < 0 ? `${formatCurrency(Math.abs(t.balance))} Cr` : formatCurrency(t.balance)
    ]);
    
    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'For Month', 'Description', 'Charge', 'Payment', 'Balance']],
        body: waterTableBody,
        theme: 'striped',
        headStyles: { fillColor: [21, 128, 61] },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Water Bill Balance:', 140, yPos);
    doc.text(waterDue > 0 ? formatCurrency(waterDue) : `${formatCurrency(waterCredit)} Cr`, 196, yPos, { align: 'right' });
    
    yPos += 10;
    
    // --- Overall Total ---
    doc.setDrawColor(150);
    doc.line(14, yPos, 196, yPos);
    yPos += 5;
    
    const totalDue = serviceChargeDue + waterDue;
    const totalCredit = serviceChargeCredit + waterCredit;
    const finalBalance = totalDue - totalCredit;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Balance Due:', 140, yPos);
    doc.text(finalBalance > 0 ? formatCurrency(finalBalance) : `${formatCurrency(Math.abs(finalBalance))} Cr`, 196, yPos, { align: 'right' });
    
    doc.save(`service_charge_statement_${owner.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};


export const generateLandlordStatementPDF = (
    landlord: Landlord,
    summary: FinancialSummary,
    transactions: { date: string; unit: string; gross: number; serviceCharge: number; mgmtFee: number; otherCosts?: number; net: number, rentForMonth?: string }[],
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
        ['Total Rent (Gross)', formatCurrency(summary.totalRent)],
        ['Service Charges (from Occupied Units)', `-${formatCurrency(summary.totalServiceCharges)}`],
        ['Management Fees', `-${formatCurrency(summary.totalManagementFees)}`],
        ['Other Costs (Transaction Fees)', `-${formatCurrency(summary.totalOtherCosts || 0)}`],
    ];

    if (summary.vacantUnitServiceChargeDeduction && summary.vacantUnitServiceChargeDeduction > 0) {
      summaryData.push(['Service Charges (from Vacant Units)', `-${formatCurrency(summary.vacantUnitServiceChargeDeduction)}`])
    }

    summaryData.push(['Net Rent Payout', formatCurrency(summary.totalNetRemittance)]);

    autoTable(doc, {
        startY: yPos,
        body: summaryData,
        theme: 'plain',
        styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3 } },
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
        acc.otherCosts += t.otherCosts || 0;
        acc.net += t.net;
        return acc;
    }, { gross: 0, serviceCharge: 0, mgmtFee: 0, otherCosts: 0, net: 0 });

    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Unit', 'For Month', 'Gross', 'S. Charge', 'Mgmt Fee', 'Other Costs', 'Net']],
        body: transactions.map(t => [
            t.date,
            t.unit,
            t.rentForMonth || 'N/A',
            formatCurrency(t.gross),
            `-${formatCurrency(t.serviceCharge)}`,
            `-${formatCurrency(t.mgmtFee)}`,
            `-${formatCurrency(t.otherCosts || 0)}`,
            formatCurrency(t.net),
        ]),
        foot: [[
            { content: 'Totals', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(totals.gross), styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(totals.serviceCharge)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(totals.mgmtFee)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(totals.otherCosts)}`, styles: { fontStyle: 'bold', halign: 'right' } },
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
            7: { halign: 'right' },
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

export const generateTenantStatementPDF = (
    tenant: Tenant,
    payments: Payment[],
    properties: Property[],
    waterReadings: WaterMeterReading[]
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    const statementTitle = tenant.residentType === 'Homeowner' ? 'Resident Statement' : 'Tenant Statement';
    addHeader(doc, statementTitle);

    const property = properties.find(p => p.id === tenant.propertyId);
    const unit = property?.units.find(u => u.name === tenant.unitName);
    const monthlyCharge = tenant.residentType === 'Homeowner' 
        ? (unit?.serviceCharge || tenant.lease.serviceCharge || 0) 
        : (tenant.lease.rent || 0);
    const chargeLabel = tenant.residentType === 'Homeowner' ? 'Monthly Service Charge' : 'Monthly Rent';
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`STATEMENT FOR:`, 14, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(tenant.name, 14, 54);
    doc.text(`Unit: ${tenant.unitName} (${unit?.unitType || 'N/A'})`, 14, 60);
    doc.text(`${chargeLabel}: ${formatCurrency(monthlyCharge)}`, 14, 66);
    
    doc.setFontSize(10);
    doc.text(`Date Issued: ${dateStr}`, 196, 48, { align: 'right' });

    // Generate Ledgers
    const { ledger: rentLedger, finalDueBalance: rentDue, finalAccountBalance: rentCredit } = generateLedger(tenant, payments, properties, waterReadings, undefined, undefined, { includeWater: false });
    const { ledger: waterLedger, finalDueBalance: waterDue, finalAccountBalance: waterCredit } = generateLedger(tenant, payments, properties, waterReadings, undefined, undefined, { includeRent: false, includeServiceCharge: false });

    let yPos = 80;

    // --- Rent/Service Charge Section ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Rent / Service Charge Statement', 14, yPos);
    yPos += 2;

    const rentTableBody = rentLedger.map(t => [
        t.date,
        t.forMonth || '',
        t.description,
        t.charge > 0 ? formatCurrency(t.charge) : '',
        t.payment > 0 ? formatCurrency(t.payment) : '',
        t.balance < 0 ? `${formatCurrency(Math.abs(t.balance))} Cr` : formatCurrency(t.balance)
    ]);

    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'For Month', 'Description', 'Charge', 'Payment', 'Balance']],
        body: rentTableBody,
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Rent/Service Charge Balance:', 140, yPos);
    doc.text(rentDue > 0 ? formatCurrency(rentDue) : `${formatCurrency(rentCredit)} Cr`, 196, yPos, { align: 'right' });
    yPos += 10;
    
    // --- Water Bill Section ---
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Water Bill Statement', 14, yPos);
    yPos += 2;

    const waterTableBody = waterLedger.map(t => [
        t.date,
        t.forMonth || '',
        t.description,
        t.charge > 0 ? formatCurrency(t.charge) : '',
        t.payment > 0 ? formatCurrency(t.payment) : '',
        t.balance < 0 ? `${formatCurrency(Math.abs(t.balance))} Cr` : formatCurrency(t.balance)
    ]);
    
    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'For Month', 'Description', 'Charge', 'Payment', 'Balance']],
        body: waterTableBody,
        theme: 'striped',
        headStyles: { fillColor: [21, 128, 61] },
        columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
    });

    yPos = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Water Bill Balance:', 140, yPos);
    doc.text(waterDue > 0 ? formatCurrency(waterDue) : `${formatCurrency(waterCredit)} Cr`, 196, yPos, { align: 'right' });
    
    yPos += 10;
    
    // --- Overall Total ---
    doc.setDrawColor(150);
    doc.line(14, yPos, 196, yPos);
    yPos += 5;
    
    const totalDue = rentDue + waterDue;
    const totalCredit = rentCredit + waterCredit;
    const finalBalance = totalDue - totalCredit;

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Total Balance Due:', 140, yPos);
    doc.text(finalBalance > 0 ? formatCurrency(finalBalance) : `${formatCurrency(Math.abs(finalBalance))} Cr`, 196, yPos, { align: 'right' });

    doc.save(`statement_${tenant.name.replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};


export const generateArrearsServiceChargeInvoicePDF = (
    owner: PropertyOwner | Landlord,
    invoiceDetails: {
        month: string;
        items: { description: string; amount: number; }[];
        totalDue: number;
    }
): string => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    addHeader(doc, 'Service Charge Invoice');
    
    // Owner Details
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.email, 14, 56);
    
    // Invoice Details
    doc.text(`Invoice Date: ${dateStr}`, 196, 50, { align: 'right' });
    doc.text(`For: ${invoiceDetails.month}`, 196, 56, { align: 'right' });

    let yPos = 70;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Outstanding Service Charges for Vacant Unit', 14, yPos);
    yPos += 8;

    const body = invoiceDetails.items.map(item => [item.description, formatCurrency(item.amount)]);

    autoTable(doc, {
        startY: yPos,
        head: [['Description', 'Amount']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6] }, // Amber
        foot: [[{ content: 'TOTAL DUE', styles: { fontStyle: 'bold', halign: 'right' } }, formatCurrency(invoiceDetails.totalDue)]],
        footStyles: { fillColor: [255, 251, 235], textColor: [0, 0, 0], fontStyle: 'bold' },
        columnStyles: {
            1: { halign: 'right' }
        },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
    doc.setTextColor(40);
    doc.setFont('helvetica', 'normal');
    doc.text('Please remit payment at your earliest convenience to settle this outstanding balance.', 14, yPos);

    return doc.output('datauristring').split(',')[1];
};


export const generateDashboardReportPDF = (
    stats: { title: string, value: string | number }[],
    financialData: { name: string, amount: number }[],
    rentBreakdown: { unitType: string, smRent?: number, landlordRent?: number }[],
    maintenanceBreakdown: { status: string, count: number }[],
    orientationBreakdown: { name: string, value: number }[]
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    addHeader(doc, 'Dashboard Report');
    doc.setFontSize(10);
    doc.text(`Generated on: ${dateStr}`, 196, 48, { align: 'right' });

    let yPos = 55;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Key Performance Indicators', 14, yPos);
    yPos += 5;
    autoTable(doc, {
        startY: yPos,
        body: stats.map(s => [s.title, s.value]),
        theme: 'plain',
        styles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold' } },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Overview', 14, yPos);
    yPos += 5;
    autoTable(doc, {
        startY: yPos,
        head: [['Category', 'Amount (Ksh)']],
        body: financialData.map(d => [d.name, d.amount.toLocaleString()]),
        theme: 'striped',
        headStyles: { fillColor: [41, 102, 182] },
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Rent Revenue Breakdown', 14, yPos);
    yPos += 5;
    autoTable(doc, {
        startY: yPos,
        head: [['Unit Type', 'SM Units (Ksh)', 'Landlord Units (Ksh)']],
        body: rentBreakdown.map(d => [d.unitType, (d.smRent || 0).toLocaleString(), (d.landlordRent || 0).toLocaleString()]),
        theme: 'striped',
        headStyles: { fillColor: [22, 163, 74] },
    });

    doc.addPage();
    yPos = 20;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Maintenance Request Status', 14, yPos);
    yPos += 5;
    autoTable(doc, {
        startY: yPos,
        head: [['Status', 'Count']],
        body: maintenanceBreakdown.map(d => [d.status, d.count]),
        theme: 'striped',
    });
    yPos = (doc as any).lastAutoTable.finalY + 10;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Unit Orientation Breakdown', 14, yPos);
    yPos += 5;
    autoTable(doc, {
        startY: yPos,
        head: [['Orientation', 'Count']],
        body: orientationBreakdown.map(d => [d.name, d.value]),
        theme: 'striped',
    });

    doc.save(`dashboard_report_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateVacantServiceChargeInvoicePDF = (
    owner: PropertyOwner | Landlord,
    unit: Unit,
    property: Property,
    arrearsDetail: { month: string, amount: number, status: string }[],
    totalDue: number,
): void => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });

    addHeader(doc, 'Service Charge Invoice');
    
    // Owner Details
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.email, 14, 56);
    
    // Invoice Details
    doc.text(`Invoice Date: ${dateStr}`, 196, 50, { align: 'right' });
    doc.text(`For Unit: ${unit.name} (${property.name})`, 196, 56, { align: 'right' });

    let yPos = 70;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Outstanding Service Charges for Vacant Unit', 14, yPos);
    yPos += 8;

    const body = arrearsDetail.filter(d => d.status === 'Pending').map(d => [d.month, formatCurrency(d.amount)]);

    autoTable(doc, {
        startY: yPos,
        head: [['Month', 'Amount Due']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6] },
        foot: [[
            { content: 'TOTAL DUE', styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(totalDue), styles: { fontStyle: 'bold', halign: 'right' } }
        ]],
        footStyles: { fillColor: [255, 251, 235], textColor: [0, 0, 0] },
        columnStyles: { 1: { halign: 'right' } },
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
    doc.setTextColor(40);
    doc.setFont('helvetica', 'normal');
    doc.text('Please remit payment at your earliest convenience to settle this outstanding balance.', 14, yPos);

    doc.save(`service_charge_invoice_${owner.name.replace(/ /g, '_')}_${unit.name}.pdf`);
};
