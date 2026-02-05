from flask import Flask, render_template, jsonify, send_file, request
import os
import secrets
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

app = Flask(__name__)

# Configuration from environment variables
app.config['SECRET_KEY'] = os.environ.get('SECRET_KEY') or secrets.token_hex(32)
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size

# Path to the tapes directory
TAPES_DIR = Path(__file__).parent / 'tapes'

# Allowed tape file extensions
ALLOWED_EXTENSIONS = {
    '.sss', '.kcc', '.tap', '.853', '.855', 
    '.kcb', '.pic', '.bil', '.ovr', '.kct'
}

def is_safe_filename(filename):
    """
    Validate filename to prevent path traversal attacks.
    Returns True if the filename is safe, False otherwise.
    """
    if not filename:
        return False
    
    # Check for path traversal attempts
    dangerous_chars = ['..', '/', '\\', '\0']
    if any(char in filename for char in dangerous_chars):
        return False
    
    # Check if it's a valid filename (alphanumeric, dots, dashes, underscores)
    # Allow only safe characters
    import re
    if not re.match(r'^[a-zA-Z0-9._+-]+$', filename):
        return False
    
    return True

def is_allowed_extension(filename):
    """Check if the file extension is in the allowed list."""
    ext = Path(filename).suffix.lower()
    return ext in ALLOWED_EXTENSIONS

@app.after_request
def add_security_headers(response):
    """Add security headers to all responses."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'"
    return response

@app.route('/')
def index():
    """Serve the main UI page"""
    return render_template('index.html')

@app.route('/recorder')
def recorder():
    """Serve the tape recorder page"""
    return render_template('recorder.html')

@app.route('/api/tapes')
def list_tapes():
    """Return a list of all tape files in the tapes directory"""
    try:
        tape_files = []
        if TAPES_DIR.exists():
            for file in sorted(TAPES_DIR.iterdir()):
                if file.is_file() and is_allowed_extension(file.name):
                    tape_files.append({
                        'name': file.name,
                        'size': file.stat().st_size,
                        'extension': file.suffix.lower()
                    })
        return jsonify({'tapes': tape_files})
    except OSError as e:
        logger.error("Error listing tapes: %s", e)
        return jsonify({'error': 'Unable to list tape files'}), 500
    except Exception as e:
        logger.error("Unexpected error in list_tapes: %s", e)
        return jsonify({'error': 'An unexpected error occurred'}), 500

@app.route('/api/tape/<filename>')
def get_tape(filename):
    """Serve a specific tape file"""
    # Validate filename before any file operations
    if not is_safe_filename(filename):
        logger.warning("Attempt to access unsafe filename: %s", filename)
        return jsonify({'error': 'Invalid filename'}), 400
    
    if not is_allowed_extension(filename):
        logger.warning("Attempt to access file with disallowed extension: %s", filename)
        return jsonify({'error': 'File type not allowed'}), 400
    
    try:
        tape_path = TAPES_DIR / filename
        
        # Resolve paths to check for path traversal
        tape_path_resolved = tape_path.resolve()
        tapes_dir_resolved = TAPES_DIR.resolve()
        
        # Security check: ensure file is within tapes directory
        if not str(tape_path_resolved).startswith(str(tapes_dir_resolved)):
            logger.warning("Path traversal attempt detected: %s", filename)
            return jsonify({'error': 'Access denied'}), 403
        
        # Check if file exists
        if not tape_path_resolved.exists() or not tape_path_resolved.is_file():
            return jsonify({'error': 'Tape file not found'}), 404
        
        # Serve file with explicit mimetype
        return send_file(
            tape_path_resolved, 
            as_attachment=False,
            mimetype='application/octet-stream'
        )
        
    except FileNotFoundError:
        return jsonify({'error': 'Tape file not found'}), 404
    except PermissionError:
        logger.error("Permission denied accessing file: %s", filename)
        return jsonify({'error': 'Access denied'}), 403
    except OSError as e:
        logger.error("OS error serving tape %s: %s", filename, e)
        return jsonify({'error': 'Unable to serve file'}), 500
    except Exception as e:  # noqa: BLE001 - intentional catch-all for security
        logger.error("Unexpected error serving tape %s: %s", filename, e)
        return jsonify({'error': 'An unexpected error occurred'}), 500

@app.route('/api/tape/save', methods=['POST'])
def save_tape():
    """Save a decoded tape file to the tapes directory"""
    try:
        # Get JSON data from request
        data = request.get_json()
        
        if not data or 'filename' not in data or 'content' not in data:
            return jsonify({'error': 'Missing filename or content'}), 400
        
        filename = data['filename']
        content = data['content']  # Base64 encoded or byte array
        
        # Validate filename
        if not is_safe_filename(filename):
            logger.warning("Attempt to save unsafe filename: %s", filename)
            return jsonify({'error': 'Invalid filename'}), 400
        
        if not is_allowed_extension(filename):
            logger.warning("Attempt to save file with disallowed extension: %s", filename)
            return jsonify({'error': 'File type not allowed'}), 400
        
        # Check if file already exists
        tape_path = TAPES_DIR / filename
        if tape_path.exists():
            return jsonify({'error': 'File already exists'}), 409
        
        # Decode content if base64
        import base64
        try:
            if isinstance(content, str):
                file_bytes = base64.b64decode(content)
            else:
                file_bytes = bytes(content)
        except Exception as decode_error:
            logger.error("Error decoding tape content: %s", decode_error)
            return jsonify({'error': 'Invalid content encoding'}), 400
        
        # Save file
        with open(tape_path, 'wb') as f:
            f.write(file_bytes)
        
        logger.info("Saved decoded tape: %s (%d bytes)", filename, len(file_bytes))
        
        return jsonify({
            'success': True,
            'filename': filename,
            'size': len(file_bytes)
        }), 201
        
    except PermissionError:
        logger.error("Permission denied saving tape file")
        return jsonify({'error': 'Permission denied'}), 403
    except OSError as e:
        logger.error("OS error saving tape: %s", e)
        return jsonify({'error': 'Unable to save file'}), 500
    except Exception as e:  # noqa: BLE001 - intentional catch-all for security
        logger.error("Unexpected error saving tape: %s", e)
        return jsonify({'error': 'An unexpected error occurred'}), 500

if __name__ == "__main__":
    # Get configuration from environment variables
    debug_mode = os.environ.get('DEBUG', 'False').lower() == 'true'
    host = os.environ.get('HOST', '127.0.0.1')
    port = int(os.environ.get('PORT', 5000))
    
    # Warn if running in debug mode
    if debug_mode:
        logger.warning("Running in DEBUG mode - DO NOT use in production!")
    
    # Warn if SECRET_KEY is not set
    if not os.environ.get('SECRET_KEY'):
        logger.warning("SECRET_KEY not set - using random key (sessions will not persist across restarts)")
    
    logger.info("Starting Flask server on %s:%s", host, port)
    app.run(debug=debug_mode, host=host, port=port)
