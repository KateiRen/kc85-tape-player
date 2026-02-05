from flask import Flask, render_template, jsonify, send_file
import os
from pathlib import Path

app = Flask(__name__)

# Path to the tapes directory
TAPES_DIR = Path(__file__).parent / 'tapes'

@app.route('/')
def index():
    """Serve the main UI page"""
    return render_template('index.html')

@app.route('/api/tapes')
def list_tapes():
    """Return a list of all tape files in the tapes directory"""
    try:
        tape_files = []
        if TAPES_DIR.exists():
            for file in sorted(TAPES_DIR.iterdir()):
                if file.is_file():
                    tape_files.append({
                        'name': file.name,
                        'size': file.stat().st_size,
                        'extension': file.suffix.lower()
                    })
        return jsonify({'tapes': tape_files})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/tape/<filename>')
def get_tape(filename):
    """Serve a specific tape file"""
    try:
        tape_path = TAPES_DIR / filename
        if not tape_path.exists() or not tape_path.is_file():
            return jsonify({'error': 'Tape file not found'}), 404
        
        # Check if the file is within the tapes directory (security check)
        if not str(tape_path.resolve()).startswith(str(TAPES_DIR.resolve())):
            return jsonify({'error': 'Invalid file path'}), 403
        
        return send_file(tape_path, as_attachment=False)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
