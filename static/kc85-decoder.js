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
        this.recordedData = [];
        
        // Decoded data
        this.decodedBlocks = [];
        this.headerBlock = null;
        this.dataBlocks = [];
        
        // Callbacks
        this.onProgress = config.onProgress || (() => {});
        this.onComplete = config.onComplete || (() => {});
        this.onError = config.onError || ((err) => console.error(err));
        this.onLevel = config.onLevel || (() => {});
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
                    this.recordedData.push(new Float32Array(inputData));
                    
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
                }
            };
            
            source.connect(this.processor);
            this.processor.connect(this.audioContext.destination);
            
            this.recording = true;
            this.recordedData = [];
            
            this.log('Recording started...');
            this.onProgress('Recording started...');
            
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
        this.onProgress('Recording stopped. Processing...');
    }
    
    // ========== PULSE DETECTION ==========
    
    detectPulses(audioData) {
        this.log('Detecting pulses...');
        const pulses = [];
        
        let lastZeroCrossing = 0;
        let lastSign = 0;
        let pulseDurations = [];
        
        for (let i = 1; i < audioData.length; i++) {
            const sample = audioData[i];
            const prevSample = audioData[i - 1];
            
            // Detect zero crossing (positive to negative and vice versa)
            if (Math.abs(sample) > this.config.zeroCrossingThreshold) {
                const currentSign = sample > 0 ? 1 : -1;
                
                if (lastSign !== 0 && currentSign !== lastSign) {
                    // Zero crossing detected
                    const duration = (i - lastZeroCrossing) / this.config.sampleRate;
                    
                    if (duration > this.config.shortPulseMin && duration < this.config.stopPulseMax) {
                        pulseDurations.push(duration);
                    }
                    
                    lastZeroCrossing = i;
                }
                
                lastSign = currentSign;
            }
        }
        
        // Convert half-periods to full periods (complete wave cycles)
        // Each pulse is actually a complete wave, so we need pairs of zero crossings
        for (let i = 1; i < pulseDurations.length; i += 2) {
            const fullPeriod = pulseDurations[i - 1] + pulseDurations[i];
            pulses.push(fullPeriod);
        }
        
        this.log(`Detected ${pulses.length} pulses`);
        return pulses;
    }
    
    // ========== PULSE TO BIT CONVERSION ==========
    
    pulsesToBits(pulses) {
        this.log('Converting pulses to bits...');
        const bits = [];
        
        for (const pulse of pulses) {
            if (pulse >= this.config.shortPulseMin && pulse <= this.config.shortPulseMax) {
                bits.push(0);  // Short pulse = bit 0
            } else if (pulse >= this.config.longPulseMin && pulse <= this.config.longPulseMax) {
                bits.push(1);  // Long pulse = bit 1
            } else if (pulse >= this.config.stopPulseMin && pulse <= this.config.stopPulseMax) {
                bits.push('S');  // Stop bit
            } else {
                // Invalid pulse length - skip or mark as error
                this.log(`Warning: Invalid pulse length ${(pulse * 1000).toFixed(3)} ms`);
            }
        }
        
        this.log(`Converted ${bits.length} bits`);
        return bits;
    }
    
    // ========== BIT TO BYTE CONVERSION ==========
    
    bitsToBytes(bits) {
        this.log('Converting bits to bytes...');
        const bytes = [];
        let i = 0;
        
        while (i < bits.length) {
            // Look for start bit (0)
            if (bits[i] === 0) {
                i++;  // Skip start bit
                
                if (i + 8 >= bits.length) break;
                
                // Read 8 data bits (LSB first)
                let byte = 0;
                let dataBits = [];
                for (let bit = 0; bit < 8; bit++) {
                    const bitValue = bits[i++];
                    if (bitValue === 0 || bitValue === 1) {
                        dataBits.push(bitValue);
                        byte |= (bitValue << bit);
                    } else {
                        // Invalid bit in data
                        break;
                    }
                }
                
                if (dataBits.length !== 8) {
                    continue;  // Skip incomplete byte
                }
                
                // Read parity bit
                if (i >= bits.length) break;
                const parityBit = bits[i++];
                
                // Calculate expected parity (odd parity)
                const expectedParity = (dataBits.reduce((a, b) => a + b, 0) % 2) ^ 1;
                
                if (parityBit !== expectedParity) {
                    this.log(`Warning: Parity error at byte ${bytes.length}`);
                }
                
                // Read stop bit (should be 'S' or 1)
                if (i < bits.length && (bits[i] === 'S' || bits[i] === 1)) {
                    i++;
                }
                
                bytes.push(byte);
            } else {
                i++;
            }
        }
        
        this.log(`Decoded ${bytes.length} bytes`);
        return bytes;
    }
    
    // ========== PILOT TONE AND SYNC DETECTION ==========
    
    detectPilotAndSync(bits) {
        this.log('Detecting pilot tone and sync...');
        
        // Look for pilot tone: many consecutive 0 bits followed by a 1
        let pilotCount = 0;
        let maxPilotCount = 0;
        let syncPosition = -1;
        
        for (let i = 0; i < bits.length; i++) {
            if (bits[i] === 0) {
                pilotCount++;
                if (pilotCount > maxPilotCount) {
                    maxPilotCount = pilotCount;
                }
            } else if (bits[i] === 1 && pilotCount >= this.config.pilotToneMinBits) {
                syncPosition = i;
                this.log(`Pilot tone: ${pilotCount} bits, sync at position ${syncPosition}`);
                break;
            } else {
                pilotCount = 0;
            }
        }
        
        if (syncPosition < 0) {
            this.log('Warning: No pilot tone/sync detected');
            return 0;
        }
        
        return syncPosition + 1;  // Return position after sync
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
    
    // ========== MAIN DECODE PIPELINE ==========
    
    async decode() {
        try {
            this.onProgress('Processing recorded audio...');
            
            // Concatenate all recorded chunks
            const totalLength = this.recordedData.reduce((acc, chunk) => acc + chunk.length, 0);
            const audioData = new Float32Array(totalLength);
            let offset = 0;
            for (const chunk of this.recordedData) {
                audioData.set(chunk, offset);
                offset += chunk.length;
            }
            
            this.log(`Total audio samples: ${audioData.length}`);
            
            // Step 1: Detect pulses
            this.onProgress('Detecting pulses...');
            const pulses = this.detectPulses(audioData);
            
            if (pulses.length === 0) {
                throw new Error('No pulses detected in audio');
            }
            
            // Step 2: Convert pulses to bits
            this.onProgress('Converting pulses to bits...');
            const bits = this.pulsesToBits(pulses);
            
            if (bits.length === 0) {
                throw new Error('No valid bits decoded');
            }
            
            // Step 3: Detect pilot tone and sync
            this.onProgress('Detecting pilot tone...');
            const dataStart = this.detectPilotAndSync(bits);
            
            if (dataStart === 0) {
                throw new Error('No pilot tone or sync detected');
            }
            
            // Step 4: Convert bits to bytes
            this.onProgress('Decoding bytes...');
            const allBits = bits.slice(dataStart);
            const bytes = this.bitsToBytes(allBits);
            
            if (bytes.length < this.config.headerBlockSize) {
                throw new Error('Insufficient data decoded');
            }
            
            // Step 5: Parse header block
            this.onProgress('Parsing header...');
            this.headerBlock = this.parseHeaderBlock(bytes, 0);
            
            // Step 6: Parse data block(s)
            this.onProgress('Parsing data blocks...');
            let dataOffset = this.config.headerBlockSize;
            this.dataBlocks = [];
            
            while (dataOffset < bytes.length && this.dataBlocks.length === 0) {
                const remainingData = this.headerBlock.dataLength - this.dataBlocks.reduce((acc, block) => acc + block.data.length, 0);
                
                if (remainingData <= 0) break;
                
                const block = this.parseDataBlock(bytes, dataOffset, remainingData);
                this.dataBlocks.push(block);
                dataOffset += block.data.length + 1;  // +1 for checksum
            }
            
            this.onProgress('Decoding complete!');
            this.onComplete({
                header: this.headerBlock,
                dataBlocks: this.dataBlocks,
                totalBytes: bytes.length
            });
            
            return {
                header: this.headerBlock,
                dataBlocks: this.dataBlocks,
                success: true
            };
            
        } catch (error) {
            this.onError('Decode error: ' + error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
    
    // ========== TAPE FILE GENERATION ==========
    
    generateTapeFile() {
        if (!this.headerBlock || this.dataBlocks.length === 0) {
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
        this.recordedData = [];
        this.decodedBlocks = [];
        this.headerBlock = null;
        this.dataBlocks = [];
    }
}
