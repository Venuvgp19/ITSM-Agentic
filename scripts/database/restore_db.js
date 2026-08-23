const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function restore() {
    const data = JSON.parse(fs.readFileSync('apps/backend/data/database.json', 'utf-8'));
    await prisma.masterDb.upsert({
        where: { key: 'master_itsm_db' },
        create: { key: 'master_itsm_db', data },
        update: { data }
    });
    console.log('Restored', data.incidents?.length || 0, 'incidents');
    await prisma.$disconnect();
    process.exit(0);
}

restore().catch(e => { console.error(e); process.exit(1); });