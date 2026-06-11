import requests
import os

api_key = os.environ.get("VITE_API_KEY", "")
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"

response = requests.get(url)
if response.status_code == 200:
    data = response.json()
    models = data.get("models", [])
    for m in models:
        print(m)
        name = m.get("name", "")
        methods = m.get("supportedGenerationMethods", [])
        if "bidiGenerateContent" in methods:
            print(f"*** LIVE API SUPPORTED ***: {name}")
    print("Checked all models for bidiGenerateContent.")
else:
    print(f"Error: {response.status_code}")
    print(response.text)
