import sys, io, psycopg2
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
c = psycopg2.connect('postgresql://itsm_user:itsm_password@127.0.0.1:5432/itsm_db')
cur = c.cursor()
cur.execute('''SELECT number, state, "createdAt" FROM "Incident" ORDER BY "createdAt" DESC, number DESC LIMIT 25''')
rows = cur.fetchall()
print('=== Most recent incidents (createdAt desc) ===')
for r in rows:
    print(f'{r[0]:12} {r[1]:10} {r[2]}')
cur.close(); c.close()