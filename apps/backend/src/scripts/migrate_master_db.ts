import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting data migration from MasterDb to relational tables...');
  const master = await prisma.masterDb.findUnique({
    where: { key: 'master_itsm_db' },
  });

  if (!master || !master.data) {
    console.log('No MasterDb data found. Exiting.');
    return;
  }

  const data: any = master.data;
  
  // Ensure a Tenant exists
  let tenant = await prisma.tenant.findFirst();
  if (!tenant) {
    tenant = await prisma.tenant.create({
      data: {
        id: 'tenant_acme_01',
        name: 'Acme Corporation',
        domain: 'acme.com',
      },
    });
    console.log('Created default tenant: ', tenant.id);
  } else {
    console.log('Found existing tenant: ', tenant.id);
  }

  // Migrate Incidents
  if (data.incidents && Array.isArray(data.incidents)) {
    console.log(`Migrating ${data.incidents.length} incidents...`);
    for (const inc of data.incidents) {
      try {
        await prisma.incident.upsert({
          where: { number: inc.number },
          update: {
            state: inc.state,
            description: inc.description || '',
            shortDescription: inc.shortDescription || '',
            impact: inc.impact || 'TEAM',
            urgency: inc.urgency || 'MEDIUM',
            priority: inc.priority || 'MODERATE',
            callerName: inc.caller,
            assignedToName: inc.assignedTo,
            department: inc.department,
            resolutionCode: inc.resolutionCode,
            resolutionNotes: inc.resolutionNotes,
            configurationItemName: inc.configurationItem,
            activitiesJson: inc.activities || [],
          },
          create: {
            id: inc.id,
            tenantId: tenant.id,
            number: inc.number,
            state: inc.state || 'NEW',
            description: inc.description || '',
            shortDescription: inc.shortDescription || '',
            impact: inc.impact || 'TEAM',
            urgency: inc.urgency || 'MEDIUM',
            priority: inc.priority || 'MODERATE',
            callerName: inc.caller,
            assignedToName: inc.assignedTo,
            department: inc.department,
            resolutionCode: inc.resolutionCode,
            resolutionNotes: inc.resolutionNotes,
            configurationItemName: inc.configurationItem,
            activitiesJson: inc.activities || [],
            createdAt: inc.createdAt ? new Date(inc.createdAt) : new Date(),
          },
        });
      } catch (err) {
        console.error(`Failed to migrate incident ${inc.number}:`, err.message);
      }
    }
  }

  // Migrate Knowledge Articles
  if (data.knowledgeArticles && Array.isArray(data.knowledgeArticles)) {
    console.log(`Migrating ${data.knowledgeArticles.length} knowledge articles...`);
    for (const kb of data.knowledgeArticles) {
      try {
        await prisma.knowledgeArticle.upsert({
          where: { number: kb.number },
          update: {
            title: kb.title || '',
            category: kb.category,
            configurationItem: kb.configurationItem,
            summary: kb.summary,
            symptoms: kb.symptoms || [],
            rootCause: kb.rootCause,
            resolutionSteps: kb.resolutionSteps || [],
            workNotesAnalyzedCount: kb.workNotesAnalyzedCount,
            sourceIncidentIds: kb.sourceIncidentIds || [],
            author: kb.author,
            modelUsed: kb.modelUsed,
            viewsCount: kb.viewCount || 0,
            helpfulCount: kb.helpfulCount || 0,
          },
          create: {
            id: kb.id,
            tenantId: tenant.id,
            number: kb.number,
            title: kb.title || '',
            category: kb.category,
            configurationItem: kb.configurationItem,
            summary: kb.summary,
            symptoms: kb.symptoms || [],
            rootCause: kb.rootCause,
            resolutionSteps: kb.resolutionSteps || [],
            workNotesAnalyzedCount: kb.workNotesAnalyzedCount,
            sourceIncidentIds: kb.sourceIncidentIds || [],
            author: kb.author,
            modelUsed: kb.modelUsed,
            viewsCount: kb.viewCount || 0,
            helpfulCount: kb.helpfulCount || 0,
            createdAt: kb.createdAt ? new Date(kb.createdAt) : new Date(),
          },
        });
      } catch (err) {
        console.error(`Failed to migrate KB ${kb.number}:`, err.message);
      }
    }
  }

  // Migrate Change Requests
  if (data.changes && Array.isArray(data.changes)) {
    console.log(`Migrating ${data.changes.length} change requests...`);
    for (const c of data.changes) {
      try {
        await prisma.changeRequest.upsert({
          where: { number: c.number },
          update: {
            title: c.title || '',
            description: c.description || '',
            changeType: c.changeType || 'NORMAL',
            state: c.state || 'DRAFT',
            approvalState: c.approvalState || 'NOT_REQUESTED',
            riskScore: c.riskScore || 1,
            configurationItemName: c.configurationItem,
            assignedToName: c.assignedTo,
            requestedByName: c.requestedBy,
            plannedStartDate: c.plannedStartDate ? new Date(c.plannedStartDate) : null,
            plannedEndDate: c.plannedEndDate ? new Date(c.plannedEndDate) : null,
            implementationPlan: c.implementationPlan,
            backoutPlan: c.backoutPlan,
            cabNotes: c.cabNotes,
          },
          create: {
            id: c.id,
            tenantId: tenant.id,
            number: c.number,
            title: c.title || '',
            description: c.description || '',
            changeType: c.changeType || 'NORMAL',
            state: c.state || 'DRAFT',
            approvalState: c.approvalState || 'NOT_REQUESTED',
            riskScore: c.riskScore || 1,
            configurationItemName: c.configurationItem,
            assignedToName: c.assignedTo,
            requestedByName: c.requestedBy,
            plannedStartDate: c.plannedStartDate ? new Date(c.plannedStartDate) : null,
            plannedEndDate: c.plannedEndDate ? new Date(c.plannedEndDate) : null,
            implementationPlan: c.implementationPlan,
            backoutPlan: c.backoutPlan,
            cabNotes: c.cabNotes,
            createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
          },
        });
      } catch (err) {
        console.error(`Failed to migrate change ${c.number}:`, err.message);
      }
    }
  }

  // Migrate Problems
  if (data.problems && Array.isArray(data.problems)) {
    console.log(`Migrating ${data.problems.length} problems...`);
    for (const p of data.problems) {
      try {
        await prisma.problem.upsert({
          where: { number: p.number },
          update: {
            shortDescription: p.shortDescription || '',
            description: p.description || '',
            rootCause: p.rootCause,
            workaround: p.workaround,
            knownError: p.knownError || false,
            state: p.state || 'NEW',
            priority: p.priority || 'MODERATE',
            configurationItemName: p.configurationItem,
            assignedToName: p.assignedTo,
            relatedIncidentsCount: p.relatedIncidentsCount || 0,
          },
          create: {
            id: p.id,
            tenantId: tenant.id,
            number: p.number,
            shortDescription: p.shortDescription || '',
            description: p.description || '',
            rootCause: p.rootCause,
            workaround: p.workaround,
            knownError: p.knownError || false,
            state: p.state || 'NEW',
            priority: p.priority || 'MODERATE',
            configurationItemName: p.configurationItem,
            assignedToName: p.assignedTo,
            relatedIncidentsCount: p.relatedIncidentsCount || 0,
            createdAt: p.createdAt ? new Date(p.createdAt) : new Date(),
          },
        });
      } catch (err) {
        console.error(`Failed to migrate problem ${p.number}:`, err.message);
      }
    }
  }

  // Migrate Agent Approvals
  if (data.agentApprovals && Array.isArray(data.agentApprovals)) {
    console.log(`Migrating ${data.agentApprovals.length} agent approvals...`);
    for (const appr of data.agentApprovals) {
      try {
        await prisma.agentApproval.upsert({
          where: { id: appr.id },
          update: {
            status: appr.status,
            confidenceScore: appr.confidenceScore,
            details: appr.details || {},
          },
          create: {
            id: appr.id,
            type: appr.type || 'EXECUTION',
            entityId: appr.entityId || '',
            entityType: appr.entityType || '',
            summary: appr.summary || '',
            proposedAction: appr.proposedAction || '',
            confidenceScore: appr.confidenceScore || 0,
            status: appr.status || 'PENDING',
            details: appr.details || {},
            timestamp: appr.timestamp ? new Date(appr.timestamp) : new Date(),
          },
        });
      } catch (err) {
        console.error(`Failed to migrate approval ${appr.id}:`, err.message);
      }
    }
  }

  // Migrate Agent Timeline (History)
  if (data.agentTimeline && Array.isArray(data.agentTimeline)) {
    console.log(`Migrating ${data.agentTimeline.length} agent timeline events...`);
    for (const evt of data.agentTimeline) {
      try {
        await prisma.agentHistory.upsert({
          where: { id: evt.id },
          update: {
            title: evt.title,
            description: evt.description,
            metadata: evt.metadata || {},
          },
          create: {
            id: evt.id,
            type: evt.type || 'LOG',
            incidentId: evt.incidentId,
            title: evt.title || '',
            description: evt.description || '',
            metadata: evt.metadata || {},
            timestamp: evt.timestamp ? new Date(evt.timestamp) : new Date(),
          },
        });
      } catch (err) {
        console.error(`Failed to migrate timeline event ${evt.id}:`, err.message);
      }
    }
  }

  console.log('Migration complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
