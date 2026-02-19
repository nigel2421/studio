
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { 
    FinancialDocument, 
    WaterMeterReading, 
    Payment, 
    ServiceChargeStatement, 
    Landlord, 
    Unit, 
    Property, 
    PropertyOwner, 
    Tenant, 
    LedgerEntry, 
    FinancialSummary, 
    UnitType, 
    UnitOrientation, 
    unitOrientations, 
    DisplayTransaction 
} from './types';
import { format, parseISO, isValid } from 'date-fns';
import { generateLedger } from './financial-logic';

const addHeader = (doc: jsPDF, title: string, brand: string = 'Eracov Properties Ltd') => {
    const isMegaRack = brand === 'Mega Rack';
    const phone = isMegaRack ? '0793111222' : '+254 793 111 222';
    const email = isMegaRack ? 'megaracktradingltd@gmail.com' : 'support@eracovproperties.com';
    const address = isMegaRack ? 'Westlands, Nairobi' : 'Westlands, Nairobi';

    doc.setTextColor(40);
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text(brand, 14, 20);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(address, 14, 26);
    doc.text(`Phone: ${phone}`, 14, 30);
    doc.text(`Email: ${email}`, 14, 34);

    doc.setFontSize(16);
    doc.setTextColor(0, 51, 102);
    doc.text(title.toUpperCase(), 196, 20, { align: 'right' });

    doc.setDrawColor(200);
    doc.line(14, 40, 196, 40);
};

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
        headStyles: { fillColor: [22, 163, 74] },
        foot: [['TOTAL PAID', formatCurrency(payment.amount)]],
        footStyles: { fillColor: [240, 253, 244], textColor: [0, 0, 0], fontStyle: 'bold' }
    });

    doc.text('Thank you for your payment.', 14, (doc as any).lastAutoTable.finalY + 20);
};

const generateWaterBill = (doc: jsPDF, document: FinancialDocument) => {
    addHeader(doc, 'Water Bill', 'Mega Rack');

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
        headStyles: { fillColor: [37, 99, 235] },
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
        headStyles: { fillColor: [217, 119, 6] },
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
    context: 'service-charge' | 'water' | 'full' = 'full'
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const isWaterContext = context === 'water';
    const isServiceChargeContext = context === 'service-charge';

    addHeader(doc, isWaterContext ? 'Water Bill Statement' : 'STATEMENT');

    const ownerUnits = allProperties.flatMap(p =>
        p.units
            .filter(u => 'assignedUnits' in owner ? (owner as PropertyOwner).assignedUnits.some((au: { propertyId: string; unitNames: string[]; }) => au.propertyId === p.id && au.unitNames.includes(u.name)) : u.landlordId === owner.id)
            .map(u => ({ ...u, propertyId: p.id, propertyName: p.name }))
    );

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('STATEMENT FOR:', 14, 48);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.name, 14, 54);
    
    doc.text(`Date Issued: ${dateStr}`, 196, 48, { align: 'right' });
    const periodStr = `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
    doc.text(`Period: ${periodStr}`, 196, 54, { align: 'right' });

    let yPos = 70;
    
    if (isServiceChargeContext) {
        yPos = 62;
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text('Your Units:', 14, yPos);
        
        let unitYPos = yPos + 6;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        ownerUnits.slice(0, 5).forEach(unit => {
            const charge = unit.serviceCharge || 0;
            const line = `- ${unit.name}: Service Charge KSh ${charge.toLocaleString()} pm`;
            doc.text(line, 14, unitYPos);
            unitYPos += 5;
        });
        
        yPos = Math.max(80, unitYPos + 6);
    }

    const associatedTenants = allTenants.filter(t => 
        t.residentType === 'Homeowner' && 
        ((owner.userId && t.userId === owner.userId) || t.email === owner.email)
    );
    
    let representativeTenant: Tenant;
    let associatedTenantIds: string[];

    if (associatedTenants.length > 0) {
        representativeTenant = associatedTenants[0];
        associatedTenantIds = associatedTenants.map(t => t.id);
    } else {
        representativeTenant = {
            id: `dummy-${owner.id}`,
            name: owner.name,
            email: owner.email,
            phone: owner.phone,
            idNumber: 'N/A',
            residentType: 'Homeowner',
            lease: { 
                startDate: '2000-01-01', 
                endDate: '2099-12-31', 
                rent: 0, 
                paymentStatus: 'Paid',
                serviceCharge: 0
            },
            propertyId: '', 
            unitName: '', 
            agent: 'Susan', 
            status: 'active', 
            securityDeposit: 0, 
            waterDeposit: 0, 
            accountBalance: 0, 
            dueBalance: 0
        };
        associatedTenantIds = [];
    }

    const allAssociatedPayments = allPayments.filter(p => associatedTenantIds.includes(p.tenantId));
    const allAssociatedWaterReadings = allWaterReadings.filter(r => associatedTenantIds.includes(r.tenantId));


    const { ledger: serviceChargeLedger, finalDueBalance: serviceChargeDue, finalAccountBalance: serviceChargeCredit } = generateLedger(representativeTenant, allAssociatedPayments, allProperties, [], owner, endDate, { includeWater: false, includeRent: false, includeServiceCharge: true });
    
    const { ledger: waterLedger, finalDueBalance: waterDue, finalAccountBalance: waterCredit } = generateLedger(representativeTenant, allAssociatedPayments, allProperties, allAssociatedWaterReadings, owner, endDate, { includeRent: false, includeServiceCharge: false, includeWater: true });

    const filterLedgerByDate = (ledger: LedgerEntry[]) => {
        return ledger.filter(entry => {
            try {
                const entryDate = parseISO(entry.date);
                return isValid(entryDate) && entryDate >= startDate && entryDate <= endDate;
            } catch {
                return false;
            }
        });
    };

    if (context === 'service-charge' || context === 'full') {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Service Charge Statement', 14, yPos);
        yPos += 8;

        const serviceChargeTableBody = filterLedgerByDate(serviceChargeLedger).map(t => [
            t.date, t.forMonth || '', t.description, t.charge > 0 ? formatCurrency(t.charge) : '', t.payment > 0 ? formatCurrency(t.payment) : '', t.balance < 0 ? `${formatCurrency(Math.abs(t.balance))} Cr` : formatCurrency(t.balance)
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
        yPos += 15;
    }

    if (context === 'water' || context === 'full') {
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('Water Bill Statement', 14, yPos);
        yPos += 8;

        const waterTableBody = filterLedgerByDate(waterLedger).map(entry => {
            let readingDetails = { unit: entry.description, prior: '', current: '', rate: '' };
            if (entry.id.startsWith('charge-water-')) {
                const readingId = entry.id.replace('charge-water-', '');
                const reading = allAssociatedWaterReadings.find(r => r.id === readingId);
                if (reading) {
                    readingDetails.unit = reading.unitName;
                    readingDetails.prior = reading.priorReading.toString();
                    readingDetails.current = reading.currentReading.toString();
                    readingDetails.rate = formatCurrency(reading.rate);
                }
            }
            return [
                entry.date,
                entry.forMonth || '',
                readingDetails.unit,
                readingDetails.prior,
                readingDetails.current,
                readingDetails.rate,
                entry.charge > 0 ? formatCurrency(entry.charge) : '',
                entry.payment > 0 ? formatCurrency(entry.payment) : '',
                entry.balance < 0 ? `${formatCurrency(Math.abs(entry.balance))} Cr` : formatCurrency(entry.balance)
            ];
        });
        
        autoTable(doc, {
            startY: yPos,
            head: [['Date', 'For Month', 'Unit', 'Prior Rd', 'Current Rd', 'Rate', 'Amount', 'Payment', 'Balance']],
            body: waterTableBody,
            theme: 'striped',
            headStyles: { fillColor: [21, 128, 61] },
            columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } }
        });

        yPos = (doc as any).lastAutoTable.finalY + 10;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Water Bill Balance:', 140, yPos);
        doc.text(waterDue > 0 ? formatCurrency(waterDue) : `${formatCurrency(waterCredit)} Cr`, 196, yPos, { align: 'right' });
    }
    
    doc.save(`statement_${owner.name.toLowerCase().replace(/ /g, '_')}_${context}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateArrearsServiceChargeInvoicePDF = (
    owner: PropertyOwner | Landlord,
    invoiceDetails: {
        month: string;
        items: { description: string; amount: number }[];
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
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 14, 50);
    doc.setFont('helvetica', 'normal');
    doc.text(owner.email, 14, 56);
    
    doc.text(`Invoice Date: ${dateStr}`, 196, 50, { align: 'right' });
    doc.text(`For: ${invoiceDetails.month}`, 196, 56, { align: 'right' });

    let yPos = 70;
    
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Outstanding Service Charges', 14, yPos);
    yPos += 8;

    const body = invoiceDetails.items.map(item => [item.description, formatCurrency(item.amount)]);

    autoTable(doc, {
        startY: yPos,
        head: [['Description', 'Amount Due']],
        body,
        theme: 'striped',
        headStyles: { fillColor: [217, 119, 6] },
        foot: [[
            { content: 'TOTAL DUE', styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(invoiceDetails.totalDue), styles: { fontStyle: 'bold', halign: 'right' } }
        ]],
        footStyles: { fillColor: [255, 251, 235], textColor: [0, 0, 0] },
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

export const generateLandlordStatementPDF = (
    landlord: Landlord,
    summary: FinancialSummary,
    transactions: DisplayTransaction[],
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

    addHeader(doc, 'LANDLORD STATEMENT');

    let yPos = 50;
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('STATEMENT FOR:', 14, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(landlord.name, 14, yPos + 6);

    doc.text(`Date Issued: ${dateStr}`, 196, yPos, { align: 'right' });
    
    if (startDate && endDate) {
        const periodStr = `${format(startDate, 'PPP')} - ${format(endDate, 'PPP')}`;
        doc.text(`Period: ${periodStr}`, 196, yPos + 6, { align: 'right' });
    }

    yPos += 23;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Financial Summary', 14, yPos);
    yPos += 8;
    
    const totalUnitsCount = units.length;
    const serviceChargeLabel = totalUnitsCount > 1 ? 'Service Charges (from Occupied Units)' : 'Service Charges';

    const summaryData = [
        ['Total Rent (Gross)', formatCurrency(summary.totalRent)],
        [serviceChargeLabel, `-${formatCurrency(summary.totalServiceCharges)}`],
        ['Management Fees', `-${formatCurrency(summary.totalManagementFees)}`],
    ];

    if (summary.vacantUnitServiceChargeDeduction && summary.vacantUnitServiceChargeDeduction > 0) {
        summaryData.push(['Service Charges (from Vacant Units)', `-${formatCurrency(summary.vacantUnitServiceChargeDeduction)}`]);
    }

    summaryData.push(['Net Rent Payout', formatCurrency(summary.totalNetRemittance)]);

    autoTable(doc, {
        startY: yPos,
        body: summaryData,
        theme: 'grid', 
        styles: { fontSize: 10, cellPadding: { top: 3, bottom: 3 } },
        columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Transaction History', 14, yPos);
    yPos += 8;
    
    const groupedByMonth = transactions.reduce((acc, t: DisplayTransaction) => {
        const month = t.rentForMonth || format(new Date(), 'yyyy-MM');
        if (!acc[month]) acc[month] = [];
        acc[month].push(t);
        return acc;
    }, {} as Record<string, DisplayTransaction[]>);

    const sortedMonths = Object.keys(groupedByMonth).sort((a, b) => a.localeCompare(b));
    
    const body: any[] = [];

    sortedMonths.forEach(month => {
        const monthDateStr = month + '-01';
        const monthDate = parseISO(monthDateStr);
        if(!isValid(monthDate)) return;

        body.push([{ content: format(monthDate, 'MMMM yyyy'), colSpan: 7, styles: { fontStyle: 'bold', fillColor: [240, 240, 240], textColor: [0,0,0] } }]);
        const monthTransactions = groupedByMonth[month];
        monthTransactions.forEach((t: DisplayTransaction) => {
            body.push([
                t.date,
                t.unitName,
                t.forMonthDisplay,
                formatCurrency(t.gross),
                t.serviceChargeDeduction > 0 ? `-${formatCurrency(t.serviceChargeDeduction)}` : formatCurrency(0),
                t.managementFee > 0 ? `-${formatCurrency(t.managementFee)}` : '',
                formatCurrency(t.netToLandlord)
            ]);
        });
    });
    
    autoTable(doc, {
        startY: yPos,
        head: [['Date', 'Unit', 'For Month', 'Gross', 'S. Charge', 'Mgmt Fee', 'Net']],
        body: body,
        foot: [[
            { content: 'Totals', colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(summary.totalRent), styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(summary.totalServiceCharges + (summary.vacantUnitServiceChargeDeduction || 0))}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: `-${formatCurrency(summary.totalManagementFees)}`, styles: { fontStyle: 'bold', halign: 'right' } },
            { content: formatCurrency(summary.totalNetRemittance), styles: { fontStyle: 'bold', halign: 'right' } }
        ]],
        footStyles: { fillColor: [220, 220, 220], textColor: [0,0,0] },
        theme: 'striped', 
        styles: { fontSize: 8, cellPadding: 2, lineWidth: 0 }, 
        headStyles: { fillColor: [41, 102, 182], textColor: [255, 255, 255], lineWidth: 0 },
        columnStyles: {
            3: { halign: 'right' },
            4: { halign: 'right' },
            5: { halign: 'right' },
            6: { halign: 'right' },
        },
        didDrawCell: (data) => {
            if (data.section === 'body' || data.section === 'head' || data.section === 'foot') {
                doc.setDrawColor(200);
                doc.setLineWidth(0.1);
                
                if (data.column.index < data.table.columns.length - 1) {
                    const x = data.cell.x + data.cell.width;
                    doc.line(x, data.cell.y, x, data.cell.y + data.cell.height);
                }
                
                if (data.column.index === 0) {
                    doc.line(data.cell.x, data.cell.y, data.cell.x, data.cell.y + data.cell.height);
                }
            }
        }
    });

    yPos = (doc as any).lastAutoTable.finalY + 15;
    
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Unit Portfolio', 14, yPos); yPos += 8;

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
            `Note: A deduction of ${formatCurrency(summary.vacantUnitServiceChargeDeduction)} has been made for service charges on your vacant units during the reporting period.`,
            14,
            yPos
        );
        yPos += 10;
    }

    doc.save(`landlord_statement_${landlord.name.toLowerCase().replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateTenantStatementPDF = (
    tenant: Tenant,
    payments: Payment[],
    properties: Property[],
    waterReadings: WaterMeterReading[],
    context: 'rent' | 'water' | 'full' | 'megarack' = 'full'
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
    });
    
    const isWaterContext = context === 'water' || context === 'megarack';
    const statementTitle = isWaterContext ? 'Water Bill Statement' : tenant.residentType === 'Homeowner' ? 'Resident Statement' : 'Tenant Statement';
    const brand = context === 'megarack' ? 'Mega Rack' : 'Eracov Properties';

    addHeader(doc, statementTitle, brand);
    
    const property = properties.find(p => p.id === tenant.propertyId);
    const unit = property?.units.find(u => u.name === tenant.unitName);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`STATEMENT FOR:`, 14, 48);
    doc.setFont('helvetica', 'normal');
    doc.text(tenant.name, 14, 54);
    if (!isWaterContext) {
        const monthlyCharge = tenant.residentType === 'Homeowner' 
            ? (unit?.serviceCharge || tenant.lease.serviceCharge || 0) 
            : (tenant.lease.rent || 0);
        const chargeLabel = tenant.residentType === 'Homeowner' ? 'Monthly Service Charge' : 'Monthly Rent';
        doc.text(`Unit: ${tenant.unitName} (${unit?.unitType || 'N/A'})`, 14, 60);
        doc.text(`${chargeLabel}: ${formatCurrency(monthlyCharge)}`, 14, 66);
    }
    
    doc.setFontSize(10);
    doc.text(`Date Issued: ${dateStr}`, 196, 48, { align: 'right' });

    const asOf = new Date();

    const { ledger: rentLedger, finalDueBalance: rentDue, finalAccountBalance: rentCredit } = generateLedger(tenant, payments, properties, [], undefined, asOf, { includeWater: false });
    const { ledger: waterLedger, finalDueBalance: waterDue, finalAccountBalance: waterCredit } = generateLedger(tenant, payments, properties, waterReadings, undefined, asOf, { includeRent: false, includeServiceCharge: false, includeWater: true });

    let yPos = isWaterContext ? 60 : 80;

    if (context === 'rent' || context === 'full') {
        const rentTableBody = rentLedger.map(t => [
            t.date,
            t.forMonth || '',
            t.description,
            t.charge > 0 ? formatCurrency(t.charge) : '',
            t.payment > 0 ? formatCurrency(t.payment) : '',
            t.balance < 0 ? `${formatCurrency(Math.abs(t.balance))} Cr` : formatCurrency(t.balance)
        ]);

        if (rentTableBody.length > 0) {
            autoTable(doc, {
                startY: yPos,
                head: [['Date', 'For Month', 'Description', 'Charge', 'Payment', 'Balance']],
                body: rentTableBody,
                theme: 'striped',
                headStyles: { fillColor: [37, 99, 235] },
                columnStyles: { 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' } }
            });
            yPos = (doc as any).lastAutoTable.finalY + 10;
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        const balanceLabel = tenant.residentType === 'Homeowner' ? 'Service Charge Balance:' : 'Rent Balance:';
        doc.text(balanceLabel, 140, yPos);
        doc.text(rentDue > 0 ? formatCurrency(rentDue) : `${formatCurrency(rentCredit)} Cr`, 196, yPos, { align: 'right' });
        yPos += 10;
    }
    
    if (context === 'water' || context === 'full' || context === 'megarack') {
        const waterTableBody = waterLedger.map(entry => {
            let readingDetails = { unit: entry.description, prior: '', current: '', rate: '' };
            if (entry.id.startsWith('charge-water-')) {
                const readingId = entry.id.replace('charge-water-', '');
                const reading = waterReadings.find(r => r.id === readingId);
                if (reading) {
                    readingDetails.unit = reading.unitName;
                    readingDetails.prior = reading.priorReading.toString();
                    readingDetails.current = reading.currentReading.toString();
                    readingDetails.rate = formatCurrency(reading.rate);
                }
            }
            return [
                entry.date,
                entry.forMonth || '',
                readingDetails.unit,
                readingDetails.prior,
                readingDetails.current,
                readingDetails.rate,
                entry.charge > 0 ? formatCurrency(entry.charge) : '',
                entry.payment > 0 ? formatCurrency(entry.payment) : '',
                entry.balance < 0 ? `${formatCurrency(Math.abs(entry.balance))} Cr` : formatCurrency(entry.balance)
            ];
        });
        
        if (waterTableBody.length > 0) {
            autoTable(doc, {
                startY: yPos,
                head: [['Date', 'For Month', 'Unit', 'Prior Rd', 'Current Rd', 'Rate', 'Amount', 'Payment', 'Balance']],
                body: waterTableBody,
                theme: 'striped',
                headStyles: { fillColor: [21, 128, 61] },
                columnStyles: { 6: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } }
            });
            yPos = (doc as any).lastAutoTable.finalY + 10;
        }

        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text('Water Bill Balance:', 140, yPos);
        doc.text(waterDue > 0 ? formatCurrency(waterDue) : `${formatCurrency(waterCredit)} Cr`, 196, yPos, { align: 'right' });
    }

    const filename = context === 'megarack'
        ? `Mega_Rack_Statement_${tenant.name.toLowerCase().replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`
        : `statement_${tenant.name.toLowerCase().replace(/ /g, '_')}_${context}_${new Date().toISOString().split('T')[0]}.pdf`;
    
    doc.save(filename);
};

export const generateDashboardReportPDF = (
    stats: { title: string; value: string | number }[],
    financialData: { name: string; amount: number }[],
    rentBreakdown: { unitType: string, smRent?: number, landlordRent?: number }[],
    maintenanceBreakdown: { status: string, count: number }[],
    orientationBreakdown: { name: string, value: number }[]
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    addHeader(doc, 'Dashboard Report');
    doc.setFontSize(10);
    doc.text(`Date Issued: ${dateStr}`, 196, 48, { align: 'right' });

    let yPos = 60;
    doc.setFontSize(14); doc.setFont('helvetica', 'bold');
    doc.text('Key Statistics', 14, yPos); yPos += 8;
    autoTable(doc, { 
        startY: yPos, 
        body: stats.map(s => [s.title, s.value.toString()]), 
        theme: 'grid', 
        styles: { fontSize: 10 }, 
        columnStyles: { 1: { halign: 'right' } } 
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    doc.text('Financial Overview', 14, yPos); yPos += 8;
    autoTable(doc, { 
        startY: yPos, 
        head: [['Metric', 'Amount']], 
        body: financialData.map(d => [d.name, formatCurrency(d.amount)]), 
        theme: 'striped', 
        headStyles: { fillColor: [51, 65, 85] }, 
        columnStyles: { 1: { halign: 'right' } } 
    });
    yPos = (doc as any).lastAutoTable.finalY + 15;

    doc.text('Rent Revenue by Ownership', 14, yPos); yPos += 8;
    autoTable(doc, { 
        startY: yPos, 
        head: [['Unit Type', 'SM Rent', 'Landlord Rent']], 
        body: rentBreakdown.map(d => [d.unitType, formatCurrency(d.smRent || 0), formatCurrency(d.landlordRent || 0)]), 
        theme: 'striped', 
        headStyles: { fillColor: [51, 65, 85] }, 
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } } 
    });
    
    doc.save(`dashboard_report_${new Date().toISOString().split('T')[0]}.pdf`);
};

export const generateVacantServiceChargeInvoicePDF = (
    owner: PropertyOwner | Landlord,
    unitsWithArrears: { unit: Unit, property: Property, arrearsDetail: { month: string, amount: number }[], totalDue: number }[],
    totalDue: number,
) => {
    const doc = new jsPDF();
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    addHeader(doc, 'Service Charge Invoice');
    doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text(owner.name, 14, 50); doc.setFont('helvetica', 'normal'); doc.text(owner.email, 14, 56);
    doc.text(`Invoice Date: ${dateStr}`, 196, 50, { align: 'right' });
    doc.text(`For: Outstanding Balances on Vacant Units`, 196, 56, { align: 'right' });

    let yPos = 70;
    const body: any[] = [];
    unitsWithArrears.forEach(unitData => {
        body.push([{ content: `Unit: ${unitData.unit.name} (${unitData.property.name})`, colSpan: 2, styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } }]);
        unitData.arrearsDetail.forEach(detail => body.push([`${detail.month} Service Charge`, formatCurrency(detail.amount)]));
        body.push([{ content: `Total for Unit ${unitData.unit.name}`, styles: { fontStyle: 'bold', halign: 'right' } }, { content: formatCurrency(unitData.totalDue), styles: { fontStyle: 'bold', halign: 'right' } }]);
    });

    autoTable(doc, { 
        startY: yPos, 
        head: [['Description', 'Amount Due']], 
        body, 
        theme: 'striped', 
        headStyles: { fillColor: [217, 119, 6] }, 
        foot: [[{ content: 'GRAND TOTAL DUE', styles: { fontStyle: 'bold', halign: 'right' } }, { content: formatCurrency(totalDue), styles: { fontStyle: 'bold', halign: 'right' } }]], 
        footStyles: { fillColor: [255, 251, 235], textColor: [0, 0, 0] }, 
        columnStyles: { 1: { halign: 'right' } } 
    });
    doc.save(`vacant_sc_invoice_${owner.name.toLowerCase().replace(/ /g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`);
};
