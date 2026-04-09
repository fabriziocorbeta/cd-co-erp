import urllib.parse
import os

files = ['index.html', 'js/dashboard.js', 'js/debts.js', 'js/auth.js']
result = ""

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    result += f"\n\n--- FILE: {f} ---\n\n"
    result += content

print(f"Total chars: {len(result)}")
