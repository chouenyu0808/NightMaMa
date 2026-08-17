import urllib.request
import json
import time

apiKey = 'AIzaSyCxhdH8QKTA2NI4hI1RbeGmGNNbJ4Z9Uhk'
url = f'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={apiKey}'

payload = json.dumps({
    "contents": [{"role": "user", "parts": [{"text": "你好！我是獨自要回家的人"}]}],
    "systemInstruction": {"parts": [{"text": "你是 NightMaMa 溫暖陪伴助理。每次回答不超過 25 字繁體中文。"}]},
    "generationConfig": {
        "maxOutputTokens": 45,
        "temperature": 0.7
    }
}).encode('utf-8')

req = urllib.request.Request(url, data=payload, headers={'Content-Type': 'application/json'})

t0 = time.time()
try:
    with urllib.request.urlopen(req, timeout=5) as response:
        t1 = time.time()
        data = json.loads(response.read().decode('utf-8'))
        text = data['candidates'][0]['content']['parts'][0]['text']
        print(f'STATUS {response.status} in {t1 - t0:.2f}s -> {text.strip()}')
except Exception as e:
    print(f'FAILED -> {e}')
