import urllib.request
import json

# Test Gemini API endpoints
keys_to_test = [
    'AIzaSyCxhdH8QKTA2NI4hI1RbeGmGNNbJ4Z9Uhk',
    'AIzaSyB-vX_placeholder',
]

# Check if we can hit Gemini REST API v1beta or v1
models = ['gemini-1.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-flash-latest']

for k in keys_to_test:
    for m in models:
        url = f'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={k}'
        payload = json.dumps({
            "contents": [{"role": "user", "parts": [{"text": "晚餐要吃什麼？"}]}]
        }).encode('utf-8')
        req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(req, timeout=4) as response:
                data = json.loads(response.read().decode('utf-8'))
                print(f"KEY: {k[:10]}... MODEL: {m} -> SUCCESS!")
                print(json.dumps(data, indent=2, ensure_ascii=False))
        except Exception as e:
            print(f"KEY: {k[:10]}... MODEL: {m} -> ERROR: {e}")
