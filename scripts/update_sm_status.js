const fs = require('fs');
const path = require('path');

const backendPath = path.join(__dirname, '..', 'backend.json');
const data = JSON.parse(fs.readFileSync(backendPath, 'utf8'));

let updatedCount = 0;

data.properties.forEach(property => {
    property.units.forEach(unit => {
        if (unit.ownership === 'SM') {
            unit.managementStatus = 'Rented for Soil Merchants';
            updatedCount++;
        }
    });
});

fs.writeFileSync(backendPath, JSON.stringify(data, null, 2));
console.log(`Updated ${updatedCount} units.`);
