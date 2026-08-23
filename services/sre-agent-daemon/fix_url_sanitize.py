with open('continuous_itsm_agent_daemon.py', 'r', encoding='utf-8') as f:
    content = f.read()

old = '''            # Strip hallucinated external download URLs or fake domain calls (curl/wget with example.com / gitlab)
            if ("curl" in s_clean or "wget" in s_clean) and ("http://" in s_clean or "https://" in s_clean or "example.com" in s_clean or "gitlab" in s_clean):
                logger.warning(f"🧹 Sanitizing hallucinated external download URL from synthesized step: '{s_clean}'")
                # Replace hallucinated curl/wget download step with standard L2 file touch / setup
                s_clean = re.sub(r'(?:curl|wget)\s+[^\s]+\s+https?://[^\s]+\s+-o\s+([^\s]+)', r'touch \\1', s_clean)
                s_clean = re.sub(r'https?://[^\s]+', '', s_clean)
                if "curl" in s_clean or "wget" in s_clean or "http" in s_clean:
                    continue'''

new = '''            # Strip hallucinated external download URLs or fake domain calls (curl/wget with example.com / gitlab)
            # Skip sanitization for new use cases (new SOP generation) - preserve external URLs
            if not is_new and ("curl" in s_clean or "wget" in s_clean) and ("http://" in s_clean or "https://" in s_clean or "example.com" in s_clean or "gitlab" in s_clean):
                logger.warning(f"🧹 Sanitizing hallucinated external download URL from synthesized step: '{s_clean}'")
                # Replace hallucinated curl/wget download step with standard L2 file touch / setup
                s_clean = re.sub(r'(?:curl|wget)\s+[^\s]+\s+https?://[^\s]+\s+-o\s+([^\s]+)', r'touch \\1', s_clean)
                s_clean = re.sub(r'https?://[^\s]+', '', s_clean)
                if "curl" in s_clean or "wget" in s_clean or "http" in s_clean:
                    continue'''

if old in content:
    content = content.replace(old, new)
    with open('continuous_itsm_agent_daemon.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Fixed!')
else:
    print('Pattern not found')
    # Debug: find similar patterns
    idx = content.find('Strip hallucinated')
    if idx >= 0:
        print('Found at:', idx)
        print(content[idx:idx+500])
