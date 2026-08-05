import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.100.102', username='root', password='root123', timeout=5)

stdin, stdout, stderr = ssh.exec_command('ps aux | grep python; ss -tlnp | grep 8080; tail -30 /opt/nexacore-app/nexacore.log')
print("--- STDOUT ---")
print(stdout.read().decode())
print("--- STDERR ---")
print(stderr.read().decode())
ssh.close()
