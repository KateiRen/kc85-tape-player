Next

have the color while recording show the sweet spot of dB
have success recording
maybe decodign while recording
update readme
update readme/filestructure









I want to implement a decoder for the Robotron KC85 tape format.  
Write code that can record an incoming audio stream, detect KC85 pulses, decode them into bytes, extract header and data blocks, and finally write a tape file containing the decoded blocks.

Analyze the way kc85-player.js works to play existing tape files and also follow the complete technical specification below:

=== KC85 TAPE FORMAT SPECIFICATION ===

1. Signal Encoding
- The KC85 uses pulse-length encoding.
- Each bit is represented by a single pulse.
- Short pulse (~0.55 ms) = bit 0
- Long pulse (~1.10 ms) = bit 1
- Use a threshold around ~0.8 ms with tolerance.

2. Byte Format (11 pulses per byte)
- Start bit: 0
- 8 data bits, LSB first
- Parity bit: odd parity
- Stop bit: 1

3. Block Structure
A tape consists of:
- Pilot tone: many short pulses (bit=0)
- Sync pulse: one long pulse (bit=1)
- Header block
- Data block(s)

4. Header Block Layout (24 bytes)
offset  size  meaning
0       1     block type (0 = header)
1–16    16    filename (ASCII, padded with spaces)
17–18   2     load address (little-endian)
19–20   2     data length
21–22   2     execution address
23      1     checksum (sum of all bytes mod 256)

5. Data Block Layout
offset  size  meaning
0..N-1  N     program bytes
N       1     checksum (sum of all bytes mod 256)

6. Decoding Steps
- Record audio from microphone or audio stream.
- Convert to mono, normalize, and optionally band-pass filter around 1–3 kHz.
- Detect zero crossings or peaks to measure pulse lengths.
- Convert pulse lengths into bits (0/1).
- Group bits into bytes using the KC85 byte format.
- Detect pilot tone → sync pulse → header block → data block(s).
- Extract filename from header bytes 1–16.
- Validate parity and checksums.
- Output a structured tape file containing:
    - header block
    - one or more data blocks
    - metadata such as filename, load address, execution address, data length

7. Output Format
Create a simple tape file format (e.g., .tap or .kcc-like) that stores:
- raw header block bytes
- raw data block bytes
- metadata extracted from the header

=== TASK ===

Write a complete function (or set of functions) that:

1. Records audio from an input device.
2. Detects pulses and converts them into bits.
3. Converts bits into bytes using the KC85 byte framing.
4. Detects pilot tone and sync pulse.
5. Parses the header block and extracts the filename.
6. Parses the data block(s).
7. Writes the decoded blocks into a tape file.

Use clean, modular code with clear helper functions:
- recordAudio()
- detectPulses()
- pulsesToBits()
- bitsToBytes()
- parseHeaderBlock()
- parseDataBlock()
- writeTapeFile()

The code should be robust against timing jitter and noise.

Generate the full implementation in the chosen language.
