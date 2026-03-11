# DebateAI - VSCode Setup Guide

## Project Structure
```
debateai/
├── app.py                  # Flask backend (Python)
├── .env                    # API key (already set)
├── requirements.txt        # Python dependencies
├── templates/
│   └── index.html          # Main HTML page
└── static/
    ├── css/
    │   └── styles.css      # All styles
    └── js/
        └── main.js         # All JavaScript
```

---

## Setup in VSCode (Step by Step)

### Step 1 — Open the folder
```
File > Open Folder > select the "debateai" folder
```

### Step 2 — Open Terminal in VSCode
```
Terminal > New Terminal   (or Ctrl + ` )
```

### Step 3 — Create a virtual environment
```bash
python -m venv venv
```

### Step 4 — Activate the virtual environment

**Windows:**
```bash
venv\Scripts\activate
```

**Mac / Linux:**
```bash
source venv/bin/activate
```

### Step 5 — Install dependencies
```bash
pip install -r requirements.txt
```

### Step 6 — Run the app
```bash
python app.py
```

### Step 7 — Open in browser
```
http://localhost:5000
```

---

## Multiplayer (Friend on another phone)

1. Both devices must be on the **same Wi-Fi network**
2. Find your local IP address:
   - Windows: run `ipconfig` in terminal, look for IPv4 address (e.g. `192.168.1.5`)
   - Mac/Linux: run `ifconfig` or `ip a`
3. In `app.py`, change the last line to:
   ```python
   app.run(debug=True, host='0.0.0.0', port=5000)
   ```
4. Your friend opens `http://192.168.1.5:5000` on their phone
5. Create a room on one device, share the code, join on the other

---

## Change API Key
Edit the `.env` file:
```
GROQ_API_KEY=your_new_key_here
```

---

## Recommended VSCode Extensions
- **Python** (Microsoft) — syntax, linting
- **Pylance** — type checking
- **Live Server** — not needed (Flask serves everything)
