import sys, os, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

import psycopg2

DB = 'postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db'
INCIDENT_ID = '1e8a621c-5d6e-44cd-93bd-e61d04ffe4ac'

conn = psycopg2.connect(DB)
cur = conn.cursor()

print('=== 1) INCIDENT lookup by id ===')
cur.execute('SELECT id, number, state, "shortDescription", description, "configurationItemName", "assignedToName", "resolutionNotes", "activitiesJson" FROM "Incident" WHERE id = %s', (INCIDENT_ID,))
inc = cur.fetchone()
if not inc:
    print('NOT FOUND by id. Trying number lookup...')
    cur.execute('SELECT id, number, state, "shortDescription" FROM "Incident" WHERE number = %s', (INCIDENT_ID,))
    inc = cur.fetchone()
    if inc:
        print('Matched by number:', inc)
    else:
        print('Truly not found anywhere.')
else:
    (iid, inum, ist, isshort, isum, icfg, iasm, ires, iact) = inc
    print('id               :', iid)
    print('number           :', inum)
    print('state            :', ist)
    print('shortDescription :', (isshort or '')[:400])
    print('summary          :', (isum or '')[:400])
    print('CI               :', icfg)
    print('assignedTo       :', iasm)
    print('resolutionNotes  :', (ires or '')[:400])
    print()
    if iact:
        acts = iact if isinstance(iact, list) else json.loads(iact) if isinstance(iact, str) else []
        print(f'--- activitiesjson ({len(acts)} entries) ---')
        for a in acts[-8:]:
            if isinstance(a, dict):
                print(' *', a.get('author'), '|', (a.get('comment') or '')[:200])
    print('================================================')

print()
print('=== 2) ALL AgentApprovals for this incident (or KB8301284 / KB_NEW) ===')
cur.execute("""
    SELECT id, type, "entityId", "entityType", status, "confidenceScore", summary, "proposedAction", details
    FROM "AgentApproval"
    WHERE "entityId" = %s OR details::text ILIKE %s OR summary ILIKE %s
       OR details::text ILIKE '%KB8301284%' OR details::text ILIKE '%KB_NEW%'
    ORDER BY timestamp DESC
""", (INCIDENT_ID, '%' + INCIDENT_ID + '%', '%' + INCIDENT_ID + '%'))
appr_rows = cur.fetchall()
print('Matching approval rows:', len(appr_rows))
for r in appr_rows:
    (aid, atype, eid, etype, st, conf, summ, pa, det) = r
    print('  ----')
    print('  id            :', aid)
    print('  type          :', atype, '| entityId:', eid, '| entityType:', etype)
    print('  status        :', st, '| confidence:', conf)
    print('  summary       :', (summ or '')[:300])
    print('  proposedAction:', (pa or '')[:200])
    if det:
        try:
            d = det if isinstance(det, dict) else json.loads(det)
            print('  details keys  :', list(d.keys()))
            print('  kbTitle       :', d.get('kbTitle'))
            print('  targetCi      :', d.get('targetCi'))
            print('  incidentTitle :', d.get('incidentTitle'))
            print('  aiReasoning   :', (d.get('aiReasoning') or '')[:600])
            sd = d.get('synthesizerOutput') or {}
            print('  synthesizerOutput.kbTitle:', sd.get('kbTitle'))
            print('  synthesizerOutput.draftKbId:', sd.get('draftKbId'))
            print('  synthesizerOutput.trendInsight:', sd.get('trendInsight'))
            rel = d.get('relevance')
            print('  relevance     :', rel)
            steps = sd.get('resolutionSteps') or d.get('proposedCommands') or []
            print(f'  resolutionSteps/proposedCommands ({len(steps)}):')
            for s in steps:
                print('     -', s)
        except Exception as e:
            print('  (could not parse details:', e, ')')
cur.close()
conn.close()