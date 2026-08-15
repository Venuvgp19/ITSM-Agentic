import sys, os, io, json
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import psycopg2

DB = 'postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db'
NUMBER = 'INC8127267'

conn = psycopg2.connect(DB)
cur = conn.cursor()

print('=== INCIDENT lookup ===')
cur.execute('SELECT id, "number", state, "shortDescription", description, "configurationItemName", "assignedToName", "resolutionCode", "resolutionNotes", "activitiesJson" FROM "Incident" WHERE "number" = %s', (NUMBER,))
rows = cur.fetchall()
if not rows:
    cur.execute('SELECT id, "number", state, "shortDescription" FROM "Incident" WHERE "number" ILIKE %s', ('%' + NUMBER + '%',))
    rows = cur.fetchall()
    print('(looked up by wildcard)')
print('incident matches:', len(rows))
for r in rows:
    (iid, inum, ist, isshort, isum, icfg, iasm, irescode, ires, iact) = r
    print('---')
    print('id               :', iid)
    print('number           :', inum)
    print('state            :', ist)
    print('shortDescription :', (isshort or '')[:600])
    print('description      :', (isum or '')[:1200])
    print('CI               :', icfg)
    print('assignedTo       :', iasm)
    print('resolutionCode   :', irescode)
    print('resolutionNotes  :', (ires or '')[:800])
    print()
    if iact:
        acts = iact if isinstance(iact, list) else (json.loads(iact) if isinstance(iact, str) else [])
        print(f'--- activitiesjson ({len(acts)} entries) ---')
        for a in acts:
            if isinstance(a, dict):
                c = a.get('comment') or a.get('title') or ''
                print('#' * 80)
                print(' *', a.get('author'), '| ts:', a.get('timestamp'))
                print('   ', c[:2500])
    print('=' * 60)

print()
print('=== AgentApprovals for this incident ===')
cur.execute("""
    SELECT id, type, "entityId", "entityType", status, "confidenceScore", summary, "proposedAction", details, timestamp
    FROM "AgentApproval"
    WHERE "entityId" = %s OR details::text ILIKE %s OR summary ILIKE %s OR "proposedAction"::text ILIKE %s
    ORDER BY timestamp DESC
""", (NUMBER, '%' + NUMBER + '%', '%' + NUMBER + '%', '%' + NUMBER + '%'))
appr_rows = cur.fetchall()
print('Matching approval rows:', len(appr_rows))
for r in appr_rows:
    (aid, atype, eid, etype, st, conf, summ, pa, det, ts) = r
    print('  ----')
    print('  id            :', aid)
    print('  type          :', atype, '| entityId:', eid, '| entityType:', etype)
    print('  status        :', st, '| confidence:', conf, '| ts:', ts)
    print('  summary       :', (summ or '')[:600])
    print('  proposedAction:', (pa or '')[:400])
    if det:
        try:
            d = det if isinstance(det, dict) else json.loads(det)
            print('  details keys  :', list(d.keys()))
            print('  kbTitle       :', d.get('kbTitle'))
            print('  targetCi      :', d.get('targetCi'))
            print('  incidentTitle :', d.get('incidentTitle'))
            print('  aiReasoning   :', (d.get('aiReasoning') or '')[:1500])
            steps = d.get('proposedCommands') or (d.get('synthesizerOutput') or {}).get('resolutionSteps') or []
            print(f'  proposedCommands ({len(steps)}):')
            for s in steps:
                print('     -', s)
            print('  relevance     :', d.get('relevance'))
        except Exception as e:
            print('  (could not parse details:', e, ')')

cur.close()
conn.close()