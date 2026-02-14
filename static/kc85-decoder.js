/*
 * Robotron KC85 Tape Decoder
 * Records audio and decodes KC85 tape format
 */

class KC85Decoder {
    constructor(config = {}) {
        // Configuration with defaults
        this.config = {
            sampleRate: config.sampleRate || 48000,
            
            // Pulse duration thresholds (in seconds)
            shortPulseMin: config.shortPulseMin || 0.0003,  // 0.3 ms
            shortPulseMax: config.shortPulseMax || 0.0007,  // 0.7 ms (bit 0, ~2000Hz)
            longPulseMin: config.longPulseMin || 0.0007,    // 0.7 ms
            longPulseMax: config.longPulseMax || 0.0013,    // 1.3 ms (bit 1, ~1100Hz)
            stopPulseMin: config.stopPulseMin || 0.0013,    // 1.3 ms
            stopPulseMax: config.stopPulseMax || 0.0025,    // 2.5 ms (stop, ~550Hz)
            
            // Detection parameters
            pilotToneMinBits: config.pilotToneMinBits || 50,  // Minimum pilot tone bits
            pilotToneMaxBits: config.pilotToneMaxBits || 10000,  // Maximum pilot tone bits before giving up
            syncBitValue: 1,                                   // Sync pulse is a '1'
            
            // Signal processing
            amplitudeThreshold: config.amplitudeThreshold || 0.1,
            zeroCrossingThreshold: config.zeroCrossingThreshold || 0.01,
            
            // Block parameters
            headerBlockSize: 24,
            dataBlockMaxSize: 65536,
            
            // Debug
            debug: config.debug || false
        };
        
        // State
        this.mediaStream = null;
        this.audioContext = null;
        this.processor = null;
        this.recording = false;
        
        // Stream processing state
        this.streamBuffer = [];  // Buffer for incomplete audio chunks
        this.lastZeroCrossing = 0;
        this.lastSign = 0;
        this.pulseDurations = [];
        this.decodedBits = [];
        this.decodedBytes = [];
        this.pilotCount = 0;
        this.syncDetected = false;
        this.bitIndex = 0;
        this.byteBuffer = [];
        this.parityBit = null;
        this.inDataBits = false;
        this.dataBitsCollected = 0;
        this.currentByte = 0;
        
        // Decoded data
        this.decodedBlocks = [];
        this.headerBlock = null;
        this.dataBlocks = [];
        this.totalSamplesProcessed = 0;
        
        // Callbacks
        this.onProgress = config.onProgress || (() => {});
        this.onComplete = config.onComplete || (() => {});
        this.onError = config.onError || ((err) => console.error(err));
        this.onLevel = config.onLevel || (() => {});
        this.onDataDecoded = config.onDataDecoded || (() => {});  // Real-time data callback
    }
    
    // ========== AUDIO RECORDING ==========
    
    async startRecording() {
        try {
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: this.config.sampleRate,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                } 
            });
            
            // Create audio context
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.config.sampleRate
            });
            
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            // Create script processor for audio data
            const bufferSize = 4096;
            this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
            
            this.processor.onaudioprocess = (e) => {
                if (this.recording) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    
                    // Calculate audio level (RMS)
                    let sum = 0;
                    for (let i = 0; i < inputData.length; i++) {
                        sum += inputData[i] * inputData[i];
                    }
                    const rms = Math.sqrt(sum / inputData.length);
                    
                    // Convert to dB (reference: 1.0 = 0 dB)
                    const db = rms > 0 ? 20 * Math.log10(rms) : -60;
                    const normalizedLevel = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
                    
                    // Report level to callback
                    this.onLevel(db, normalizedLevel, rms);
                    
                    // Process audio stream in real-time
                    try {
                        this.processAudioChunk(inputData);
                    } catch (error) {
                        this.onError('Stream processing error: ' + error.message);
                        this.stopRecording();
                    }
                }
            };
            
            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            this.recording = true;
            this.resetStreamState();
            
            this.log('Recording and real-time decoding started...');
            this.log(`Initial state: syncDetected=${this.syncDetected}, decodedBytes.length=${this.decodedBytes.length}`);
            this.onProgress('Recording started - waiting for pilot tone...');
            
            return true;
        } catch (error) {
            this.onError('Failed to start recording: ' + error.message);
            return false;
        }
    }
    
    async stopRecording() {
        this.recording = false;
        
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
        
        this.log('Recording stopped.');
        this.onProgress('Recording stopped.');
        
        // Finalize any remaining data
        this.finalizeDecoding();
    }
    
    // ========== REAL-TIME STREAM PROCESSING ==========
    
    resetStreamState() {
        this.streamBuffer = [];
        this.lastZeroCrossing = 0;
        this.lastSign = 0;
        this.pulseDurations = [];
        this.decodedBits = [];
        this.decodedBytes = [];
        this.pilotCount = 0;
        this.syncDetected = false;
        this.bitIndex = 0;
        this.byteBuffer = [];
        this.parityBit = null;
        this.inDataBits = false;
        this.dataBitsCollected = 0;
        this.currentByte = 0;
        this.totalSamplesProcessed = 0;
        this.headerBlock = null;
        this.dataBlocks = [];
    }
    
    processAudioChunk(audioData) {
        // Add new chunk to buffer
        this.streamBuffer.push(...audioData);
        
        // Process zero crossings and detect pulses
        const startIdx = Math.max(0, this.streamBuffer.length - audioData.length - 100);
        
        for (let i = startIdx + 1; i < this.streamBuffer.length; i++) {
            const sample = this.streamBuffer[i];
            const prevSample = this.streamBuffer[i - 1];
            
            // Detect zero crossing
            if (Math.abs(sample) > this.config.zeroCrossingThreshold) {
                const currentSign = sample > 0 ? 1 : -1;
                
                if (this.lastSign !== 0 && currentSign !== this.lastSign) {
                    // Zero crossing detected
                    const absolutePos = this.totalSamplesProcessed + (i - startIdx);
                    const duration = (absolutePos - this.lastZeroCrossing) / this.config.sampleRate;
                    
                    if (duration > this.config.shortPulseMin && duration < this.config.stopPulseMax) {
                        this.pulseDurations.push(duration);
                        
                        // Process pairs of half-periods to get full pulses
                        if (this.pulseDurations.length >= 2) {
                            const fullPeriod = this.pulseDurations[this.pulseDurations.length - 2] + 
                                             this.pulseDurations[this.pulseDurations.length - 1];
                            this.processPulse(fullPeriod);
                        }
                    }
                    
                    this.lastZeroCrossing = absolutePos;
                }
                
                this.lastSign = currentSign;
            }
        }
        
        this.totalSamplesProcessed += audioData.length;
        
        // Keep only recent buffer data to avoid memory growth
        if (this.streamBuffer.length > 10000) {
            this.streamBuffer = this.streamBuffer.slice(-5000);
        }
    }
    
    processPulse(duration) {
        let bit = null;
        
        // Classify pulse into bit type
        if (duration >= this.config.shortPulseMin && duration <= this.config.shortPulseMax) {
            bit = 0;  // Short pulse = bit 0
        } else if (duration >= this.config.longPulseMin && duration <= this.config.longPulseMax) {
            bit = 1;  // Long pulse = bit 1
        } else if (duration >= this.config.stopPulseMin && duration <= this.config.stopPulseMax) {
            bit = 'S';  // Stop bit
        } else {
            // Invalid pulse - log warning but continue
            if (this.syncDetected) {
                this.log(`Warning: Invalid pulse ${(duration * 1000).toFixed(3)} ms at data bit ${this.decodedBits.length}`);
            }
            return;
        }
        
        // Pilot tone and sync detection (before sync is detected)
        if (!this.syncDetected) {
            if (bit === 1) {
                // Looking for pilot tone - player generates "1" bits for pilot
                this.pilotCount++;
                if (this.pilotCount % 100 === 0) {
                    this.log(`Pilot tone: ${this.pilotCount} bits...`);
                    this.onProgress(`Pilot tone: ${this.pilotCount} bits...`);
                }
                // Safety limit
                if (this.pilotCount > this.config.pilotToneMaxBits) {
                    this.log(`Warning: Pilot tone exceeded ${this.config.pilotToneMaxBits} bits, may be stuck`);
                }
            } else if ((bit === 'S' || bit === 0) && this.pilotCount >= this.config.pilotToneMinBits) {
                // After pilot tone (1's), first non-1 bit marks sync
                this.syncDetected = true;
                this.log(`✓✓✓ SYNC DETECTED! Pilot tone: ${this.pilotCount} bits, sync bit: '${bit}'. Starting data decode NOW.`);
                this.onProgress(`✓ Sync detected (${this.pilotCount} pilot bits)! Decoding data...`);
                this.pilotCount = 0;
                // Process this bit as the start of data
                this.decodedBits.push(bit);
                this.processBit(bit);
                return;
            } else {
                // Reset pilot count if we get unexpected pattern
                if (this.pilotCount > 0 && this.pilotCount < this.config.pilotToneMinBits) {
                    this.log(`Pilot tone interrupted at ${this.pilotCount} bits by bit '${bit}' - resetting`);
                }
                this.pilotCount = 0;
            }
            return;  // Don't store pilot tone bits (except when sync detected above)
        }
        
        // After sync: store bit and process as data
        this.decodedBits.push(bit);
        this.processBit(bit);
    }
    
    processBit(bit) {
        // CRITICAL: Only process bits if sync has been detected
        if (!this.syncDetected) {
            this.log(`ERROR: processBit called but sync not detected! Bit: ${bit}`);
            return;
        }
        
        // State machine for byte decoding
        if (!this.inDataBits) {
            // Looking for start bit (0)
            if (bit === 0) {
                this.inDataBits = true;
                this.dataBitsCollected = 0;
                this.currentByte = 0;
                this.byteBuffer = [];
                this.log(`Start bit detected, beginning byte ${this.decodedBytes.length + 1}`);
            }
        } else {
            // Collecting 8 data bits
            if (this.dataBitsCollected < 8) {
                if (bit === 0 || bit === 1) {
                    this.byteBuffer.push(bit);
                    this.currentByte |= (bit << this.dataBitsCollected);
                    this.dataBitsCollected++;
                } else {
                    // Invalid bit during data collection - reset
                    this.log(`Invalid bit '${bit}' during data collection, resetting byte state`);
                    this.inDataBits = false;
                }
            } else if (this.dataBitsCollected === 8) {
                // Parity bit
                const expectedParity = (this.byteBuffer.reduce((a, b) => a + b, 0) % 2) ^ 1;
                if (bit !== expectedParity && bit !== 'S' && bit !== 1) {
                    this.log(`Parity error at byte ${this.decodedBytes.length + 1}: expected ${expectedParity}, got ${bit}`);
                }
                this.dataBitsCollected++;
            } else {
                // Stop bit - byte complete
                if (bit === 'S' || bit === 1) {
                    this.decodedBytes.push(this.currentByte);
                    this.log(`Byte #${this.decodedBytes.length} decoded: 0x${this.currentByte.toString(16).padStart(2, '0').toUpperCase()} (syncDetected=${this.syncDetected})`);
                    this.onDataDecoded({
                        byteCount: this.decodedBytes.length,
                        byte: this.currentByte,
                        char: (this.currentByte >= 32 && this.currentByte < 127) ? 
                              String.fromCharCode(this.currentByte) : '.',
                        hex: this.currentByte.toString(16).padStart(2, '0').toUpperCase()
                    });
                    
                    // Try to parse header when we have enough bytes AND sync was detected
                    if (this.syncDetected && !this.headerBlock && this.decodedBytes.length >= this.config.headerBlockSize) {
                        try {
                            this.headerBlock = this.parseHeaderBlock(this.decodedBytes, 0);
                            this.log(`✓ Header parsed successfully: ${this.headerBlock.filename} (bytes in buffer: ${this.decodedBytes.length}, sync: ${this.syncDetected})`);
                            this.onProgress(`📄 Header decoded: ${this.headerBlock.filename} (${this.headerBlock.dataLength} bytes)`);
                        } catch (error) {
                            this.log('Failed to parse header: ' + error.message);
                        }
                    }
                } else {
                    this.log(`Expected stop bit, got '${bit}', resetting byte state`);
                }
                this.inDataBits = false;
            }
        }
    }
    
    finalizeDecoding() {
        if (this.decodedBytes.length === 0) {
            this.onProgress('No data decoded.');
            return;
        }
        
        this.log(`Finalized: ${this.decodedBytes.length} bytes decoded`);
        
        try {
            // Parse data blocks if we haven't already
            if (this.headerBlock && this.dataBlocks.length === 0) {
                let dataOffset = this.config.headerBlockSize;
                
                while (dataOffset < this.decodedBytes.length) {
                    const remainingExpected = this.headerBlock.dataLength - 
                        this.dataBlocks.reduce((acc, block) => acc + block.data.length, 0);
                    
                    if (remainingExpected <= 0) break;
                    
                    const availableBytes = this.decodedBytes.length - dataOffset - 1;
                    if (availableBytes < 0) break;
                    
                    const blockLength = Math.min(remainingExpected, availableBytes);
                    const block = this.parseDataBlock(this.decodedBytes, dataOffset, blockLength);
                    this.dataBlocks.push(block);
                    dataOffset += block.data.length + 1;
                }
            }
            
            this.onComplete({
                header: this.headerBlock,
                dataBlocks: this.dataBlocks,
                totalBytes: this.decodedBytes.length,
                success: true
            });
            
        } catch (error) {
            this.onError('Finalization error: ' + error.message);
        }
    }

    
    // ========== HEADER BLOCK PARSING ==========
    
    parseHeaderBlock(bytes, offset = 0) {
        this.log('Parsing header block...');
        
        if (bytes.length < offset + this.config.headerBlockSize) {
            throw new Error('Insufficient data for header block');
        }
        
        const header = {
            blockType: bytes[offset],
            filename: '',
            loadAddress: 0,
            dataLength: 0,
            execAddress: 0,
            checksum: 0
        };
        
        // Extract filename (bytes 1-16)
        for (let i = 1; i <= 16; i++) {
            const char = bytes[offset + i];
            if (char >= 32 && char < 127) {
                header.filename += String.fromCharCode(char);
            } else {
                header.filename += ' ';
            }
        }
        header.filename = header.filename.trim();
        
        // Extract addresses and length (little-endian)
        header.loadAddress = bytes[offset + 17] | (bytes[offset + 18] << 8);
        header.dataLength = bytes[offset + 19] | (bytes[offset + 20] << 8);
        header.execAddress = bytes[offset + 21] | (bytes[offset + 22] << 8);
        header.checksum = bytes[offset + 23];
        
        // Validate checksum
        let sum = 0;
        for (let i = 0; i < 23; i++) {
            sum += bytes[offset + i];
        }
        sum = sum & 0xFF;
        
        if (sum !== header.checksum) {
            this.log(`Warning: Header checksum mismatch (expected ${header.checksum}, got ${sum})`);
        }
        
        this.log(`Header: filename="${header.filename}", load=0x${header.loadAddress.toString(16)}, len=${header.dataLength}, exec=0x${header.execAddress.toString(16)}`);
        
        return header;
    }
    
    // ========== DATA BLOCK PARSING ==========
    
    parseDataBlock(bytes, offset, expectedLength) {
        this.log('Parsing data block...');
        
        const dataLength = Math.min(expectedLength, bytes.length - offset - 1);
        const data = bytes.slice(offset, offset + dataLength);
        const checksum = bytes[offset + dataLength];
        
        // Validate checksum
        let sum = 0;
        for (const byte of data) {
            sum += byte;
        }
        sum = sum & 0xFF;
        
        if (sum !== checksum) {
            this.log(`Warning: Data checksum mismatch (expected ${checksum}, got ${sum})`);
        }
        
        this.log(`Data block: ${dataLength} bytes`);
        
        return {
            data: data,
            checksum: checksum,
            valid: sum === checksum
        };
    }

    
    // ========== TAPE FILE GENERATION ==========
    
    generateTapeFile() {
        if (!this.headerBlock || this.dataBlocks.length === 0) {
            // If we only have raw bytes, return them
            if (this.decodedBytes.length > 0) {
                return new Uint8Array(this.decodedBytes);
            }
            throw new Error('No decoded data available');
        }
        
        // Create a simple .KCC format file
        const totalDataLength = this.dataBlocks.reduce((acc, block) => acc + block.data.length, 0);
        const fileSize = this.config.headerBlockSize + totalDataLength + this.dataBlocks.length;  // +checksums
        const tapeFile = new Uint8Array(fileSize);
        
        let offset = 0;
        
        // Write header block
        tapeFile[offset++] = this.headerBlock.blockType;
        for (let i = 0; i < 16; i++) {
            tapeFile[offset++] = this.headerBlock.filename.charCodeAt(i) || 32;
        }
        tapeFile[offset++] = this.headerBlock.loadAddress & 0xFF;
        tapeFile[offset++] = (this.headerBlock.loadAddress >> 8) & 0xFF;
        tapeFile[offset++] = this.headerBlock.dataLength & 0xFF;
        tapeFile[offset++] = (this.headerBlock.dataLength >> 8) & 0xFF;
        tapeFile[offset++] = this.headerBlock.execAddress & 0xFF;
        tapeFile[offset++] = (this.headerBlock.execAddress >> 8) & 0xFF;
        tapeFile[offset++] = this.headerBlock.checksum;
        
        // Write data blocks
        for (const block of this.dataBlocks) {
            tapeFile.set(block.data, offset);
            offset += block.data.length;
            tapeFile[offset++] = block.checksum;
        }
        
        return tapeFile;
    }
    
    downloadTapeFile(filename) {
        const tapeFile = this.generateTapeFile();
        const blob = new Blob([tapeFile], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || (this.headerBlock.filename + '.kcc');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // ========== UTILITY ==========
    
    log(message) {
        if (this.config.debug) {
            console.log('[KC85Decoder]', message);
        }
    }
    
    reset() {
        this.resetStreamState();
    }
}

/*
 * KC85 Zero-Crossing Decoder
 * Uses zero-crossing detection similar to KcTapeTool's NullDurchgangWaveAnalyzer
 * 
 * This decoder measures the time between zero crossings to determine frequency,
 * which maps to different bit values:
 * - 1950 Hz (~23 samples @ 44100 Hz) = Bit 0
 * - 1050 Hz (~42 samples @ 44100 Hz) = Bit 1
 * -  557 Hz (~79 samples @ 44100 Hz) = Separator/Trennzeichen
 */
class KC85ZeroCrossingDecoder {
    constructor(config = {}) {
        // Configuration
        this.config = {
            sampleRate: config.sampleRate || 44100,  // Match KcTapeTool
            
            // Frequency configuration (from Kc85xSchwingungKonfig.java)
            trennFrequenz: 557,   // Separator frequency
            einsFrequenz: 1050,   // Bit '1' frequency
            nullFrequenz: 1950,   // Bit '0' frequency
            
            // Tolerances (±20% from BitKonfig.java)
            toleranceMin: 0.8,
            toleranceMax: 1.2,
            
            // Zero crossing threshold
            zeroCrossingThreshold: config.zeroCrossingThreshold || 0.01,
            
            // Minimum gap between zero crossings (1/4 of expected period)
            minZeroCrossingGap: 5,
            
            // Pilot tone detection
            pilotToneMinBits: config.pilotToneMinBits || 20,
            pilotToneMaxBits: config.pilotToneMaxBits || 5000,
            
            // Block parameters
            headerBlockSize: 24,
            
            // Debug
            debug: config.debug || false
        };
        
        // Calculate expected sample lengths for each frequency
        this.bitConfig = {
            trenn: this.createBitConfig(this.config.trennFrequenz),
            eins: this.createBitConfig(this.config.einsFrequenz),
            null: this.createBitConfig(this.config.nullFrequenz)
        };
        
        // State
        this.mediaStream = null;
        this.audioContext = null;
        this.processor = null;
        this.recording = false;
        
        // Zero-crossing detection state
        this.sampleBuffer = [];
        this.lastSign = 0;
        this.zeroCrossings = [];  // Buffer of zero crossing positions
        this.framePos = 0;
        
        // Decoding state
        this.pilotCount = 0;
        this.syncDetected = false;
        this.decodedBytes = [];
        this.headerBlock = null;
        
        // Byte assembly state
        this.inByte = false;
        this.bitBuffer = [];
        this.currentBytePos = 0;
        
        // Callbacks
        this.onProgress = config.onProgress || (() => {});
        this.onComplete = config.onComplete || (() => {});
        this.onError = config.onError || ((err) => console.error(err));
        this.onLevel = config.onLevel || (() => {});
        this.onDataDecoded = config.onDataDecoded || (() => {});
    }
    
    createBitConfig(frequency) {
        const length = Math.round(this.config.sampleRate / frequency);
        return {
            frequency: frequency,
            length: length,
            minLength: Math.round(length * this.config.toleranceMin),
            maxLength: Math.round(length * this.config.toleranceMax)
        };
    }
    
    // ========== AUDIO RECORDING ==========
    
    async startRecording() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: this.config.sampleRate,
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                } 
            });
            
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.config.sampleRate
            });
            
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);
            
            const bufferSize = 4096;
            this.processor = this.audioContext.createScriptProcessor(bufferSize, 1, 1);
            
            this.processor.onaudioprocess = (e) => {
                if (this.recording) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    
                    // Calculate audio level
                    let sum = 0;
                    for (let i = 0; i < inputData.length; i++) {
                        sum += inputData[i] * inputData[i];
                    }
                    const rms = Math.sqrt(sum / inputData.length);
                    const db = rms > 0 ? 20 * Math.log10(rms) : -60;
                    const normalizedLevel = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
                    
                    this.onLevel(db, normalizedLevel, rms);
                    
                    try {
                        this.processAudioChunk(inputData);
                    } catch (error) {
                        this.onError('Processing error: ' + error.message);
                        this.stopRecording();
                    }
                }
            };
            
            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            this.recording = true;
            this.resetState();
            
            this.log('Zero-crossing decoder started...');
            this.onProgress('Recording started - waiting for pilot tone...');
            
            return true;
        } catch (error) {
            this.onError('Failed to start recording: ' + error.message);
            return false;
        }
    }
    
    async stopRecording() {
        this.recording = false;
        
        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }
        
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
        
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }
        
        this.log('Recording stopped.');
        this.onProgress('Recording stopped.');
        this.finalizeDecoding();
    }
    
    resetState() {
        this.sampleBuffer = [];
        this.lastSign = 0;
        this.zeroCrossings = [];
        this.framePos = 0;
        this.pilotCount = 0;
        this.syncDetected = false;
        this.decodedBytes = [];
        this.headerBlock = null;
        this.inByte = false;
        this.bitBuffer = [];
        this.currentBytePos = 0;
    }
    
    // ========== ZERO-CROSSING DETECTION ==========
    
    processAudioChunk(audioData) {
        // Process each sample for zero crossings
        for (let i = 0; i < audioData.length; i++) {
            const sample = audioData[i];
            
            // Detect zero crossing (sign change)
            if (Math.abs(sample) > this.config.zeroCrossingThreshold) {
                const currentSign = sample > 0 ? 1 : -1;
                
                if (this.lastSign !== 0 && currentSign !== this.lastSign) {
                    // Zero crossing detected!
                    this.zeroCrossings.push(this.framePos);
                    
                    // Process oscillation when we have 3 zero crossings
                    // (beginning, middle, end of one full period)
                    if (this.zeroCrossings.length >= 3) {
                        this.processOscillation();
                    }
                }
                
                this.lastSign = currentSign;
            }
            
            this.framePos++;
        }
        
        // Limit zero crossing buffer size
        if (this.zeroCrossings.length > 100) {
            const excess = this.zeroCrossings.length - 50;
            this.zeroCrossings.splice(0, excess);
        }
    }
    
    processOscillation() {
        // Check if we have a valid oscillation pattern
        // We need at least 3 crossings to determine a full period
        if (this.zeroCrossings.length < 3) return;
        
        const crossing1 = this.zeroCrossings[0];
        const crossing2 = this.zeroCrossings[1];
        const crossing3 = this.zeroCrossings[2];
        
        // Check minimum gap to avoid noise
        if (crossing2 - crossing1 < this.config.minZeroCrossingGap) {
            return;
        }
        
        const halfPeriod = crossing2 - crossing1;
        const fullPeriod = crossing3 - crossing1;
        
        // Validate that it's a proper oscillation
        // (second half should be similar length to first half)
        const secondHalf = crossing3 - crossing2;
        const halfPeriodMin = Math.round(halfPeriod * 0.7);
        const halfPeriodMax = Math.round(halfPeriod * 1.3);
        
        if (secondHalf < halfPeriodMin || secondHalf > halfPeriodMax) {
            // Not a valid oscillation, remove first crossing and try next
            this.zeroCrossings.shift();
            return;
        }
        
        // Try to match against known bit patterns
        const oscillation = this.matchOscillation(fullPeriod);
        
        if (oscillation) {
            // Valid oscillation detected - consume the crossings
            this.zeroCrossings.splice(0, 3);
            this.processDetectedBit(oscillation.type);
        } else {
            // Unknown oscillation - move forward by one crossing
            this.zeroCrossings.shift();
        }
    }
    
    matchOscillation(length) {
        // Try to match against each bit type
        const configs = [
            { type: 'TRENN', config: this.bitConfig.trenn },
            { type: 'EINS', config: this.bitConfig.eins },
            { type: 'NULL', config: this.bitConfig.null }
        ];
        
        for (const { type, config } of configs) {
            if (length >= config.minLength && length <= config.maxLength) {
                return { type, length, config };
            }
        }
        
        return null;
    }
    
    // ========== BIT PROCESSING ==========
    
    processDetectedBit(bitType) {
        // Pilot tone detection
        if (!this.syncDetected) {
            if (bitType === 'EINS') {
                this.pilotCount++;
                if (this.pilotCount % 100 === 0) {
                    this.log(`Pilot tone: ${this.pilotCount} bits...`);
                    this.onProgress(`Pilot tone: ${this.pilotCount} bits...`);
                }
                if (this.pilotCount > this.config.pilotToneMaxBits) {
                    this.log('Warning: Pilot tone too long, may be stuck');
                }
            } else if (bitType === 'TRENN' && this.pilotCount >= this.config.pilotToneMinBits) {
                // Sync detected! First separator after pilot tone
                this.syncDetected = true;
                this.log(`✓ SYNC DETECTED! Pilot: ${this.pilotCount} bits. Starting data decode.`);
                this.onProgress(`✓ Sync detected (${this.pilotCount} pilot bits)! Decoding data...`);
                // Don't process this separator as data
                return;
            } else {
                // Reset if unexpected pattern
                if (this.pilotCount > 0) {
                    this.log(`Pilot interrupted at ${this.pilotCount} bits by ${bitType}`);
                }
                this.pilotCount = 0;
            }
            return;
        }
        
        // After sync: decode bytes
        // KC85 format: 8 data bits (LSB first) + 1 separator
        if (bitType === 'TRENN') {
            // Separator marks end of byte
            if (this.bitBuffer.length === 8) {
                // Complete byte
                let byteValue = 0;
                for (let i = 0; i < 8; i++) {
                    if (this.bitBuffer[i] === 1) {
                        byteValue |= (1 << i);
                    }
                }
                
                this.decodedBytes.push(byteValue);
                this.log(`Byte #${this.decodedBytes.length}: 0x${byteValue.toString(16).padStart(2, '0').toUpperCase()}`);
                
                this.onDataDecoded({
                    byteCount: this.decodedBytes.length,
                    byte: byteValue,
                    char: (byteValue >= 32 && byteValue < 127) ? 
                          String.fromCharCode(byteValue) : '.',
                    hex: byteValue.toString(16).padStart(2, '0').toUpperCase()
                });
                
                // Try to parse header
                if (!this.headerBlock && this.decodedBytes.length >= this.config.headerBlockSize) {
                    try {
                        this.headerBlock = this.parseHeaderBlock(this.decodedBytes, 0);
                        this.log(`✓ Header parsed: ${this.headerBlock.filename}`);
                        this.onProgress(`📄 Header: ${this.headerBlock.filename} (${this.headerBlock.dataLength} bytes)`);
                    } catch (error) {
                        this.log('Failed to parse header: ' + error.message);
                    }
                }
            } else if (this.bitBuffer.length > 0) {
                this.log(`Warning: Incomplete byte with ${this.bitBuffer.length} bits`);
            }
            
            this.bitBuffer = [];
        } else {
            // Data bit
            const bit = bitType === 'EINS' ? 1 : 0;
            this.bitBuffer.push(bit);
            
            if (this.bitBuffer.length > 8) {
                this.log('Warning: More than 8 bits without separator - resetting');
                this.bitBuffer = [];
            }
        }
    }
    
    // ========== HEADER PARSING (same as original decoder) ==========
    
    parseHeaderBlock(bytes, offset = 0) {
        if (bytes.length < offset + this.config.headerBlockSize) {
            throw new Error('Insufficient data for header block');
        }
        
        const header = {
            blockType: bytes[offset],
            filename: '',
            loadAddress: 0,
            dataLength: 0,
            execAddress: 0,
            checksum: 0
        };
        
        // Extract filename (bytes 1-16)
        for (let i = 1; i <= 16; i++) {
            const char = bytes[offset + i];
            if (char >= 32 && char < 127) {
                header.filename += String.fromCharCode(char);
            } else {
                header.filename += ' ';
            }
        }
        header.filename = header.filename.trim();
        
        // Extract addresses and length (little-endian)
        header.loadAddress = bytes[offset + 17] | (bytes[offset + 18] << 8);
        header.dataLength = bytes[offset + 19] | (bytes[offset + 20] << 8);
        header.execAddress = bytes[offset + 21] | (bytes[offset + 22] << 8);
        header.checksum = bytes[offset + 23];
        
        return header;
    }
    
    finalizeDecoding() {
        if (this.decodedBytes.length === 0) {
            this.onProgress('No data decoded.');
            return;
        }
        
        this.log(`Finalized: ${this.decodedBytes.length} bytes decoded`);
        
        this.onComplete({
            header: this.headerBlock,
            totalBytes: this.decodedBytes.length,
            success: true,
            method: 'zero-crossing'
        });
    }
    
    generateTapeFile() {
        if (this.decodedBytes.length === 0) {
            throw new Error('No decoded data available');
        }
        return new Uint8Array(this.decodedBytes);
    }
    
    downloadTapeFile(filename) {
        const tapeFile = this.generateTapeFile();
        const blob = new Blob([tapeFile], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || (this.headerBlock ? this.headerBlock.filename + '.kcc' : 'decoded.kcc');
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    log(message) {
        if (this.config.debug) {
            console.log('[KC85ZeroCrossing]', message);
        }
    }
    
    reset() {
        this.resetState();
    }
}
