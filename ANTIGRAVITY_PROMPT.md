# Antigravity Initialization Prompt

Copy and paste the exact prompt below to initialize and start the Enterprise Agentic ITSM platform on a new target machine using Antigravity.

---

### Prompt for Antigravity:

```text
Please initialize and start the ITSM application. 

Before starting the services, this is a fresh clone, so you must restore the system data:
1. First, run the `import_repo_data_dump.py` script located in the root directory to automatically restore the PostgreSQL database and the ChromaDB vector store from the SQL seed dump. 
2. Ensure you have the `psycopg2-binary` and `chromadb` pip packages installed in your environment if the script requires them.

After the data is restored, please follow your standard "start app" directives to bring the entire system online:
1. Start the PostgreSQL Database on port 5432.
2. Rebuild the NestJS backend and the MCP server.
3. Start the NestJS backend API server (port 4000).
4. Start the Next.js frontend dev server (port 3000).
5. Start the Agent Control Tower Dashboard server (port 5173).
6. Start the Python Auto-Resolver Agent Daemon.
7. Start the ITSM MCP Server.
```
