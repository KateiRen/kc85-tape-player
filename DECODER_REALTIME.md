# KC85 Real-time Tape Decoder

## What Changed

The decoder has been completely refactored to process audio streams in real-time instead of recording everything first and then decoding.

### Key Improvements

1. **Real-time Processing**: Audio is decoded as it streams in, not after recording completes
2. **Early Error Detection**: If decoding fails, you know immediately (within seconds) instead of after 10 minutes
3. **Live Feedback**: See decoded bytes, header information, and progress in real-time
4. **Memory Efficient**: Doesn't store the entire audio recording in memory

### Architecture Changes

#### Before (Batch Processing)
```
[Record entire audio] → [Stop recording] → [Detect pulses] → [Decode bits] → [Parse bytes]
```
- Had to wait until recording stopped
- Used lots of memory
- No feedback during recording

#### After (Stream Processing)
```
[Audio chunk] → [Detect pulses] → [Decode bits] → [Parse bytes] → [Display data]
     ↓
[Next chunk] → ...
```
- Processes each audio chunk immediately
- Shows results in real-time
- Stops early if errors occur

### New Features

1. **Real-time Data Display**: See each decoded byte as it's processed
2. **Live Header Parsing**: Header information displayed as soon as 24 bytes are decoded
3. **Audio Level Monitoring**: Visual audio level meter with dB display
4. **Progress Logging**: Timestamped log of all decoder events
5. **Early Termination**: Stops automatically on critical errors

### Usage

Open `decoder-demo.html` in a modern web browser:

1. Click "Start Recording & Decoding"
2. Allow microphone access
3. Play KC85 tape audio (from source or through audio cable)
4. Watch real-time decoding in the display
5. Click "Stop Recording" when done
6. Download the decoded tape file

### Technical Details

#### Stream Processing State Machine

The decoder maintains a state machine that processes audio in these stages:

1. **Zero Crossing Detection**: Identifies signal transitions in real-time
2. **Pulse Classification**: Categorizes pulses as 0-bit, 1-bit, or stop-bit
3. **Pilot Tone Detection**: Watches for sync signal (50+ zeros followed by a 1)
4. **Bit-to-Byte Assembly**: Collects 8 data bits + parity + stop bit
5. **Header Parsing**: Extracts file metadata after 24 bytes
6. **Data Collection**: Continues until expected data length is reached

#### Callbacks

New `onDataDecoded` callback fires for every decoded byte:

```javascript
onDataDecoded: (data) => {
    // data = { byteCount, byte, char, hex }
    console.log(`Byte #${data.byteCount}: 0x${data.hex} (${data.char})`);
}
```

### Browser Compatibility

- Chrome/Edge: ✓ Full support
- Firefox: ✓ Full support  
- Safari: ✓ Requires experimental WebAudio features enabled
- Mobile: ⚠️ Limited (microphone permissions vary)

### Files Modified

- `static/kc85-decoder.js` - Complete refactor for stream processing
- `decoder-demo.html` - New demo page with real-time visualization

### Original Functionality

The original `kc85-player.js` for playback remains unchanged and fully functional.
