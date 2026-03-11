from flask import Flask, request, jsonify, render_template
from flask_cors import CORS
from groq import Groq
from dotenv import load_dotenv
import os

load_dotenv()

app = Flask(__name__)
CORS(app)

client = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.1-8b-instant"

# ── In-memory room store (resets on server restart) ──────────────
rooms = {}

# ── Serve frontend ───────────────────────────────────────────────
@app.route("/")
def index():
    return render_template("index.html")

# ── Chat / generation endpoint ───────────────────────────────────
@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json()
    messages = data.get("messages", [])
    max_tokens = data.get("max_tokens", 1600)

    if not messages:
        return jsonify({"error": "No messages provided"}), 400

    try:
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            temperature=0.85,
            max_tokens=max_tokens,
        )
        return jsonify({
            "content": response.choices[0].message.content,
            "tokens":  response.usage.completion_tokens,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Multiplayer room endpoints ────────────────────────────────────
@app.route("/api/room/create", methods=["POST"])
def create_room():
    data = request.get_json()
    code = data.get("code", "").upper()
    if not code:
        return jsonify({"error": "Room code required"}), 400

    rooms[code] = {
        "code":      code,
        "topic":     data.get("topic", ""),
        "stance":    data.get("stance", "pro"),
        "maxRounds": data.get("maxRounds", 5),
        "tone":      data.get("tone", "Neutral"),
        "host":      data.get("host", "Player1"),
        "guest":     None,
        "messages":  [],
        "status":    "waiting",
    }
    return jsonify({"ok": True, "room": rooms[code]})

@app.route("/api/room/<code>", methods=["GET"])
def get_room(code):
    room = rooms.get(code.upper())
    if not room:
        return jsonify({"error": "Room not found"}), 404
    return jsonify(room)

@app.route("/api/room/<code>/join", methods=["POST"])
def join_room(code):
    room = rooms.get(code.upper())
    if not room:
        return jsonify({"error": "Room not found"}), 404
    data = request.get_json()
    room["guest"]  = data.get("guest", "Player2")
    room["status"] = "ready"
    return jsonify({"ok": True, "room": room})

@app.route("/api/room/<code>/message", methods=["POST"])
def post_message(code):
    room = rooms.get(code.upper())
    if not room:
        return jsonify({"error": "Room not found"}), 404
    data = request.get_json()
    room["messages"].append({
        "author": data.get("author", ""),
        "text":   data.get("text", ""),
    })
    return jsonify({"ok": True, "count": len(room["messages"])})

@app.route("/api/room/<code>/end", methods=["POST"])
def end_room(code):
    room = rooms.get(code.upper())
    if not room:
        return jsonify({"error": "Room not found"}), 404
    room["status"] = "ended"
    return jsonify({"ok": True})

if __name__ == "__main__":
    print("\n  DebateAI running at http://localhost:5001\n")
    app.run(debug=True, port=5001)
