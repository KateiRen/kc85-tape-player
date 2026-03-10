# KC85 Tape Player - Flask Web Application

This is an experimental fork based on [chhu's KC85 tape player](https://github.com/chhu/) great work [kc85-tape-player](https://github.com/chhu/kc85-tape-player/).
Instead of running directly from javascript in the index.html (which gives me CORS policy violations trying to access the tape files) the web site is served as a flask application.
<br>➡️ A Flask-based web application for playing Robotron KC85 tape files directly in your browser.

## Features

- 🎵 Play KC85 tape files using Web Audio API
- 📁 Dynamically loads all tape files from the `tapes/` directory
- 🔍 Search functionality to filter tapes
- ⚡ Support for both Default and Turbo playback modes
- 🎨 Modern, responsive UI with gradient design
- ▶️ Play/Stop controls for audio playback

## Installation

1. Install uv first

## Running the Application

1. Start the Flask server:
```bash
uv run main
```

2. Open your browser and navigate to:
```
http://localhost:5000
```

## Usage

1. The application will automatically load all tape files from the `tapes/` directory
2. Use the search box to filter tapes by name
3. Click on any tape to select it
4. Choose between "Default Mode" or "Turbo Mode" from the dropdown
5. Click the **▶ Play** button to start playback
6. Click the **⏹ Stop** button to stop playback

## Technical Details

- **Backend**: Flask (Python)
  - `/` - Serves the main UI
  - `/api/tapes` - Returns list of available tape files
  - `/api/tape/<filename>` - Serves individual tape files

- **Frontend**: HTML/CSS/JavaScript
  - Uses the original KC85Player JavaScript class
  - Web Audio API for audio generation and playback
  - Responsive grid layout for tape display

## File Structure

```
.
├── main.py               # Flask application
├── .env                  # Store your SECRET_KEY
├── static/
│   └── kc85-player.js    # KC85 player JavaScript library
│   └── kc85-decoder.js   # KC85 recorder JavaScript library
├── templates/
│   └── index.html        # Main UI template
│   └── recorder.html     # UI template for the recorder
├── tapes/                # Directory containing tape files
├── pyproject.toml        # UVs project definition
├── uv.lock               # UVs lock file
└── Readme.md             # This file
```

## Credits

Original KC85 player implementation: https://github.com/chhu/kc85-tape-player
