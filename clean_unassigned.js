const fs = require('fs');
const path = require('path');
const dir = path.resolve('apps/backend/data');

fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.json')) {
    const filePath = path.join(dir, file);
    let str = fs.readFileSync(filePath, 'utf8');
    if (str.includes('UNASSIGNED')) {
      str = str.replace(/"UNASSIGNED \(No Team\)"/g, '"Unix"')
               .replace(/"UNASSIGNED \(Unassigned\)"/g, '"Richard Stallman (Unix)"')
               .replace(/"UNASSIGNED"/g, '"Unix"');
      fs.writeFileSync(filePath, str, 'utf8');
      console.log('Cleaned UNASSIGNED references from ' + file);
    }
  }
});
