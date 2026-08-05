import urllib.request
import json

req = urllib.request.Request('http://localhost:4000/api/v1/incidents')
try:
    with urllib.request.urlopen(req) as response:
        incidents = json.loads(response.read().decode())
        found = [i for i in incidents if i.get('number') == 'INC0001044']
        print("FOUND INC0001044:")
        print(json.dumps(found, indent=2))
except Exception as e:
    print("Error fetching incidents:", e)
