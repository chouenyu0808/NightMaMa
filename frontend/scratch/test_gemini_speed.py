import urllib.request
import json
import time

apiKey = 'AIzaSyCxhdH8QKTA2NI4hI1RbeGmGNNbJ4Z9Uhk'
models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-3.6-flash']

for m in models:
    url = f'https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent?key={apiKey}'
    payload = json.dumps({
        "contents": [{"role": "user", "parts": [{"text": "你好！請用10字簡短回應"}]}],
        "generationConfig": {"maxOutputTokens": 40, "temperature": 0.7}
    }).encode('utf-8')
    req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})
    
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            t1 = time.time()
            data = json.loads(response.read().decode('utf-8'))
            text = data.get('candidates', [{}])[0].get('content', {}).get('parts', [{}])[0].get('text', '')
            print(f'[{m}] STATUS {response.status} in {t1 - t0:.2f}s -> {text.strip()}')
    except Exception as e:
        print(f'[{m}] FAILED in {time.time() - t0:.2f}s -> {e}')
