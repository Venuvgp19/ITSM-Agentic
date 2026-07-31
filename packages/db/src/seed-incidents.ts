import { prisma, Impact, Urgency, Priority, IncidentState } from './index';

async function seed1000Incidents() {
  console.log('Generating 1,000 synthetic ITSM incident records...');

  // Ensure default tenant exists
  let tenant = await prisma.tenant.findFirst({ where: { domain: 'acme.com' } });
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        name: 'Acme Corporation',
        domain: 'acme.com',
      },
    });
  }

  // Ensure default caller user exists
  let caller = await prisma.user.findFirst({ where: { email: 'admin@acme.com' } });
  if (!caller) {
    caller = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: 'admin@acme.com',
        passwordHash: 'hashed-password-placeholder',
        firstName: 'System',
        lastName: 'Admin',
      },
    });
  }

  const sampleTitles = [
    'Core Router High Latency in NYC Datacenter',
    'SAP ERP Financials SSO Auth Failure',
    'Printer Spooler Offline - London HQ Floor 3',
    'AWS East Region DB Connection Timeout',
    'VPN Gateway Certificate Expiration Alert',
    'Kubernetes Ingress Controller High CPU Spikes',
    'PostgreSQL Primary Node Replication Lag',
    'Email Gateway Outbound Mail Queue Backlog',
    'Active Directory LDAP Sync Failure',
    'Okta MFA Webhook Delivery Timeout',
  ];

  const groups = ['Network Ops', 'App Support', 'Desktop Support', 'DevOps Ops', 'Security Ops', 'DBA Team'];
  const states = [IncidentState.NEW, IncidentState.IN_PROGRESS, IncidentState.ON_HOLD, IncidentState.RESOLVED, IncidentState.CLOSED];
  const impacts = [Impact.ENTERPRISE, Impact.DEPARTMENT, Impact.TEAM, Impact.INDIVIDUAL];
  const urgencies = [Urgency.CRITICAL, Impact.DEPARTMENT, Urgency.HIGH, Urgency.MEDIUM, Urgency.LOW];

  const batchSize = 100;
  for (let i = 1; i <= 1000; i += batchSize) {
    const batch = [];
    for (let j = 0; j < batchSize && i + j <= 1000; j++) {
      const idx = i + j;
      const num = `INC${String(idx).padStart(7, '0')}`;
      const title = `${sampleTitles[idx % sampleTitles.length]} (#${idx})`;
      const impact = impacts[idx % impacts.length];
      const urgency = (urgencies[idx % urgencies.length] as Urgency) || Urgency.MEDIUM;
      
      let priority: Priority = Priority.MODERATE;
      if (impact === Impact.ENTERPRISE && urgency === Urgency.CRITICAL) priority = Priority.CRITICAL;
      else if (impact === Impact.ENTERPRISE || urgency === Urgency.CRITICAL) priority = Priority.HIGH;
      else if (impact === Impact.INDIVIDUAL && urgency === Urgency.LOW) priority = Priority.LOW;

      batch.push({
        tenantId: tenant.id,
        number: num,
        shortDescription: title,
        description: `Synthetic Incident Record #${idx} generated for performance & stress testing.`,
        state: states[idx % states.length],
        impact,
        urgency,
        priority,
        callerId: caller.id,
      });
    }

    await prisma.incident.createMany({ data: batch });
    console.log(`Seeded incidents ${i} to ${Math.min(i + batchSize - 1, 1000)}...`);
  }

  console.log('Successfully seeded 1,000 synthetic incidents!');
}

seed1000Incidents()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
