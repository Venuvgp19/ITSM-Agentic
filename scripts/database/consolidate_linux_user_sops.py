"""
Consolidates the scattered Linux user-creation and user-deletion KB articles
into two clean master SOPs (KB0000021 for creation, KB0000038 for deletion)
that each cover single/bulk and admin/restricted/standard-access variants in
one document, and retires the redundant duplicates that accumulated from
repeated self-learning saves.

Run once: python scripts/database/consolidate_linux_user_sops.py
"""
import json
import sys
import psycopg2

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

DB_URL = "postgresql://postgres:postgres@localhost:5432/itsm_db"

CREATION_NUMBER = "KB0000021"
CREATION_RETIRE = [
    "KB0000006", "KB0000016", "KB0000027", "KB0000028",
    "KB0000029", "KB0000030", "KB0000036", "KB0000037", "KB0468213",
]
CREATION_TITLE = "Master SOP: Linux User Account Creation & Access Provisioning (Single or Bulk, Admin / Restricted / Standard Access)"
CREATION_SUMMARY = (
    "One reusable SOP for provisioning Linux user accounts, covering every combination the "
    "ticket may ask for: a single user or a batch of many users, and full admin (passwordless "
    "sudo), restricted single-command sudo, or a standard account with no sudo at all. Read the "
    "step labels and pick only the block(s) that match what the ticket actually requests."
)
CREATION_SYMPTOMS = [
    "Create a new Linux user account",
    "Provision a user with admin/root/full sudo access",
    "Grant a user restricted sudo access to run one specific command",
    "Create a standard user with no elevated privileges",
    "Bulk-create multiple Linux user accounts in one request",
]
CREATION_STEPS = [
    "[VERIFY] id -u {username} &>/dev/null && echo 'User already exists' || echo 'User does not exist, proceeding'",
    "[CREATE - SINGLE USER] useradd -m -s /bin/bash {username}",
    "[CREATE - BULK USERS] for u in {username_list}; do id -u \"$u\" &>/dev/null || useradd -m -s /bin/bash \"$u\"; done",
    "[SET PASSWORD - only if the ticket provides one] echo '{username}:{password}' | chpasswd",
    "[ACCESS: FULL ADMIN — use only when the ticket says 'admin access', 'root access', or 'full sudo'] echo '{username} ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/99-{username} && chmod 440 /etc/sudoers.d/99-{username} && visudo -c -f /etc/sudoers.d/99-{username}",
    "[ACCESS: FULL ADMIN, BULK — same as above but for every user in the batch] for u in {username_list}; do echo \"$u ALL=(ALL) NOPASSWD:ALL\" > \"/etc/sudoers.d/99-$u\" && chmod 440 \"/etc/sudoers.d/99-$u\"; done && visudo -c",
    "[ACCESS: RESTRICTED SINGLE-COMMAND — use only when the ticket grants access to run ONE specific command, e.g. 'permission to run systemctl restart nginx'] echo '{username} ALL=(ALL) NOPASSWD: {allowed_command_path}' > /etc/sudoers.d/99-{username} && chmod 440 /etc/sudoers.d/99-{username} && visudo -c -f /etc/sudoers.d/99-{username}",
    "[ACCESS: STANDARD USER — use when the ticket does not mention admin/root/sudo access at all] Do not create any /etc/sudoers.d entry; the user gets no elevated privileges.",
    "[VERIFY] id {username} && ls -ld /home/{username}",
    "[VERIFY SUDO - only if an access step above was used] sudo -l -U {username}",
]
CREATION_REASONING = (
    "Consolidated from 9 near-duplicate KB articles (KB0000006, KB0000016, KB0000027-30, "
    "KB0000036-37, KB0468213) that each hardcoded one specific scenario. The dynamic ReAct "
    "execution loop reads the labeled step blocks and, per its command-adaptation rules, "
    "selects and parameterizes only the block(s) matching the ticket's actual requirements "
    "(quantity and access level) rather than needing a separate KB per combination."
)

DELETION_NUMBER = "KB0000038"
DELETION_RETIRE = ["KB0000002", "KB0000022", "KB0000023"]
DELETION_TITLE = "Master SOP: Linux User Account Deletion & Deprovisioning (Single or Bulk)"
DELETION_SUMMARY = (
    "One reusable SOP for removing Linux user accounts, covering both a single user and a "
    "batch of many users in one document. Revokes any sudo drop-in file, kills active "
    "sessions, then deletes the account and home directory."
)
DELETION_SYMPTOMS = [
    "Remove/delete a Linux user account",
    "Offboard/deprovision a departing employee's account",
    "Bulk-delete multiple Linux user accounts in one request",
]
DELETION_STEPS = [
    "[VERIFY] id {username} 2>&1",
    "[REVOKE SUDO - SINGLE] rm -f /etc/sudoers.d/{username} /etc/sudoers.d/99-{username}",
    "[TERMINATE SESSIONS - SINGLE] pkill -9 -u {username} 2>/dev/null || true",
    "[DELETE - SINGLE USER] userdel -r -f {username} 2>/dev/null || true",
    "[DELETE - BULK USERS] for u in {username_list}; do pkill -9 -u \"$u\" 2>/dev/null; userdel -r -f \"$u\" 2>/dev/null; rm -f \"/etc/sudoers.d/$u\" \"/etc/sudoers.d/99-$u\"; done",
    "[VERIFY] id {username} 2>&1 | grep -q 'no such user' && echo 'User successfully removed' || echo 'User still exists'",
]
DELETION_REASONING = (
    "Consolidated from 3 near-duplicate KB articles (KB0000002, KB0000022, KB0000023) that "
    "each hardcoded one specific example username. The bulk step is included alongside the "
    "single-user steps so the ReAct execution loop can pick the right one based on how many "
    "usernames the ticket actually names."
)


def upsert_master(cur, number, title, summary, symptoms, steps, reasoning):
    cur.execute(
        """
        UPDATE "KnowledgeArticle" SET
            title = %s,
            summary = %s,
            symptoms = %s,
            "resolutionSteps" = %s,
            "rootCause" = %s,
            "isPublished" = true,
            "updatedAt" = NOW()
        WHERE number = %s
        """,
        (
            title,
            summary,
            json.dumps(symptoms),
            json.dumps(steps),
            reasoning,
            number,
        ),
    )
    print(f"  Updated {number}: '{title}' ({len(steps)} steps)")


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    print("--- Consolidating Linux user CREATION SOPs ---")
    upsert_master(cur, CREATION_NUMBER, CREATION_TITLE, CREATION_SUMMARY, CREATION_SYMPTOMS, CREATION_STEPS, CREATION_REASONING)
    cur.execute('DELETE FROM "KnowledgeArticle" WHERE number = ANY(%s)', (CREATION_RETIRE,))
    print(f"  Retired {cur.rowcount} duplicate creation KBs: {CREATION_RETIRE}")

    print("--- Consolidating Linux user DELETION SOPs ---")
    upsert_master(cur, DELETION_NUMBER, DELETION_TITLE, DELETION_SUMMARY, DELETION_SYMPTOMS, DELETION_STEPS, DELETION_REASONING)
    cur.execute('DELETE FROM "KnowledgeArticle" WHERE number = ANY(%s)', (DELETION_RETIRE,))
    print(f"  Retired {cur.rowcount} duplicate deletion KBs: {DELETION_RETIRE}")

    conn.commit()
    cur.close()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    main()
