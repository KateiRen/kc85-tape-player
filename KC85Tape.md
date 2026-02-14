# KC85 Kassettenformat - Umfassende Dokumentation

## Inhaltsverzeichnis

1. [Übersicht](#übersicht)
2. [Datei-Formate](#datei-formate)
3. [Audio-Signalcodierung](#audio-signalcodierung)
4. [Dateistruktur und Blockformat](#dateistruktur-und-blockformat)
5. [Dekodierungsverfahren](#dekodierungsverfahren)
6. [Best Practices für Aufnahme und Wiedergabe](#best-practices-für-aufnahme-und-wiedergabe)
7. [Programme und Tools](#programme-und-tools)
8. [Implementierungsdetails](#implementierungsdetails)
9. [Technische Referenzen](#technische-referenzen)

---

## Übersicht

Der **KC85** (Kleincomputer 85) war ein von 1984 bis 1990 in der DDR (Mühlhausen, Thüringen) hergestelltes 8-Bit-Computersystem, basierend auf dem U880-Prozessor (Z80-Klon). Das Betriebssystem **CAOS** (Cassette Aided Operating System) ermöglichte das Speichern und Laden von Programmen auf Magnetbandkassetten.

Die Kassettenaufzeichnung verwendete **FSK** (Frequency Shift Keying) bzw. **Pulse-Length Encoding**, bei dem Daten durch unterschiedliche Tonfrequenzen bzw. Pulslängen übertragen wurden.

### Modellreihe

- **HC 900** (1984) - Ursprungsmodell
- **KC 85/2** (1985)
- **KC 85/3** (1987)
- **KC 85/4** (1988-1990) - Leistungsfähigstes Modell

### Hauptmerkmale

- **Prozessor**: U880 (Z80-kompatibel)
- **Grafik**: 320 × 256 Pixel, 16 Vordergrundfarben, 8 Hintergrundfarben
- **Eingabe**: Abgesetzte Tastatur
- **Massenspeicher**: Kassetteninterface (Standard)
- **Betriebssystem**: CAOS

---

## Datei-Formate

Der KC85 verwendet mehrere Datei-Formate für gespeicherte Programme:

### 1. **KCC** (KC-Compact Format)

**Beschreibung**: Standardformat für KC85-Programme, enthält Header und Datenbytes.

**Struktur**:
- Header-Block (24 Bytes)
- Daten-Blöcke mit Prüfsummen
- Rohdaten ohne zusätzliche Container

**Verwendung**: Häufigstes Format, direkt vom CAOS-System erzeugt

**Beispieldateien**: `AIRRAID.KCC`, `DIGGER.KCC`, `CHESS.KCC`

### 2. **TAP** (Tape Format)

**Beschreibung**: Container-Format, das KC85-Daten mit zusätzlichen Metadaten einpackt.

**Kopfzeile** (16 Bytes):
```
C3 4B 43 2D 54 41 50 45 20 62 79 20 41 46 2E 20
"KC-TAPE by AF. " (ASCII)
```

**Struktur**:
- Wiederholter KC-TAPE Header vor jedem Programmblock
- 129-Byte-Blöcke: 1 Byte Block-Nummer + 128 Bytes Daten + 1 Byte Prüfsumme
- Blocknummern können 0-indiziert oder 1-indiziert sein

**Besonderheiten**:
- TAP-Header muss vor der Dekodierung entfernt werden
- Manche TAP-Dateien enthalten mehrere Programme
- Blocknummern müssen bei der Verarbeitung herausgefiltert werden

**Beispieldateien**: `ALI2.TAP`, `ANACONDA.TAP`, `BENNION3_mod.TAP`

### 3. **SSS** (Spezielles Schnellformat)

**Beschreibung**: Alternatives Format, möglicherweise von spezieller Software oder Loadern verwendet.

**Eigenschaften**:
- Ähnliche Struktur wie KCC
- Eventuell kürzere Pilot-Töne oder modifizierte Timing-Parameter
- Weniger dokumentiert als KCC

**Beispieldateien**: `17+4.SSS`, `3D-FUNC3.SSS`, `ASTRAY.SSS`

### 4. **853 / 855** (Modell-spezifische Formate)

**Beschreibung**: Datei-Endungen, die auf spezifische KC85-Modelle hinweisen.

- **853**: Für KC 85/3
- **855**: Möglicherweise für spezielle Hardware-Konfigurationen

**Beispieldateien**: `AIRRAID.853`, `BREAKOUT.853`, `BREAKOUT.855`

### 5. **KCB** (KC-BASIC)

**Beschreibung**: BASIC-Programm-Dateien

**Beispiele**: `BOMBERSP.KCB`

### Format-Kompatibilität

| Format | Kompatibilität | Header-Entfernung nötig |
|--------|----------------|-------------------------|
| **KCC** | Alle KC85-Modelle | Nein |
| **TAP** | Alle (mit Konvertierung) | Ja (16-Byte KC-TAPE Header) |
| **SSS** | Modellabhängig | Nein |
| **853/855** | Modellspezifisch | Nein |

---

## Audio-Signalcodierung

### Grundprinzip: FSK (Frequency Shift Keying)

Die KC85-Kassetten verwenden **Frequenzumtastung**, bei der verschiedene Frequenzen unterschiedliche Datenwerte repräsentieren.

### Frequenzen und Pulse

Es gibt drei verschiedene Frequenzen/Pulslängen:

| Typ | Frequenz | Periode | Pulslänge | Repräsentation |
|-----|----------|---------|-----------|----------------|
| **Bit '0'** | **~1950-2000 Hz** | ~0.5 ms | 0.3-0.7 ms (kurz) | Short Pulse |
| **Bit '1'** | **~1050-1100 Hz** | ~0.91 ms | 0.7-1.3 ms (lang) | Long Pulse |
| **Stop/Separator** | **~550-557 Hz** | ~1.82 ms | 1.3-2.5 ms (sehr lang) | Stop Pulse |

### Pulse-Length Encoding

Jedes Bit wird durch eine **vollständige Wellenperiode** dargestellt:

```
Bit 0 (Short):   ___/‾‾‾\___     (~0.5 ms, 2000 Hz)
Bit 1 (Long):    ___/‾‾‾‾‾‾‾\___   (~0.91 ms, 1100 Hz)
Stop Bit:        ___/‾‾‾‾‾‾‾‾‾‾‾‾‾\___  (~1.82 ms, 550 Hz)
```

### Byte-Format (11 Pulse pro Byte)

Jedes Byte wird mit folgendem Format übertragen:

```
[Start:0] [D0] [D1] [D2] [D3] [D4] [D5] [D6] [D7] [Parity] [Stop]
```

**Aufbau**:
1. **Start-Bit**: Immer `0` (kurzer Puls)
2. **8 Daten-Bits**: LSB zuerst (D0 bis D7)
3. **Parity-Bit**: Ungerade Parität (odd parity)
4. **Stop-Bit**: `1` oder Stop-Puls

**Beispiel**: Byte `0x42` (01000010 binär)

```
Start: 0
D0: 0
D1: 1
D2: 0
D3: 0
D4: 0
D5: 0
D6: 1
D7: 0
Parity: 0 (ungerade Anzahl von 1en → Parity = 0)
Stop: 1
```

### Pilot Tone (Synchronisationstöne)

**Zweck**: Etabliert Timing und signalisiert Programmbeginn

**Struktur**:
- Viele aufeinanderfolgende **'1'-Bits** (lange Pulse)
- Typisch: 50-8000 Pulse
- Erster Block: ~8000 Pulse
- Weitere Blöcke: ~160 Pulse

**Sync-Erkennung**:
- Nach Pilot Tone folgt ein **Stop-Bit** oder **'0'-Bit**
- Markiert den Beginn der eigentlichen Daten

### Sample-Raten

- **Standard**: 44100 Hz oder 48000 Hz
- **KcTapeTool**: 44100 Hz (empfohlen)
- **Browser Web Audio API**: 48000 Hz (typisch)

### Audio-Wellenform

Die KC85-Kassetten erzeugen annähernd **Rechteck-Signale**:

```
Ideal (Rechteck):
  ┌────┐    ┌────┐
  │    │    │    │
──┘    └────┘    └──

Real (mit Übersteuerung erwünscht):
  ┌──────┐  ┌──────┐
  │      │  │      │
──┘      └──┘      └──
```

**Übersteuerung ist erwünscht**, da sie klare Nulldurchgänge erzeugt!

---

## Dateistruktur und Blockformat

### Gesamt-Struktur einer Kassette

```
┌─────────────────────────┐
│   Pilot Tone            │ → 50-8000 × Bit '1'
├─────────────────────────┤
│   Sync Pulse            │ → Stop-Bit oder '0'
├─────────────────────────┤
│   Header Block          │ → 24 Bytes
│   (Metadaten)           │
├─────────────────────────┤
│   Data Block 1          │ → Bis zu 128 Bytes + Checksum
├─────────────────────────┤
│   Data Block 2          │
├─────────────────────────┤
│   ...                   │
├─────────────────────────┤
│   Data Block N          │
└─────────────────────────┘
```

### Header Block (24 Bytes)

Der Header-Block enthält Metadaten über das Programm:

| Offset | Größe | Feld | Beschreibung |
|--------|-------|------|--------------|
| 0 | 1 Byte | **Block Type** | `0x00` = Header |
| 1-16 | 16 Bytes | **Filename** | ASCII, mit Leerzeichen aufgefüllt |
| 17-18 | 2 Bytes | **Load Address** | Little-Endian (Z80) |
| 19-20 | 2 Bytes | **Data Length** | Little-Endian |
| 21-22 | 2 Bytes | **Execution Address** | Little-Endian (Start-Adresse) |
| 23 | 1 Byte | **Checksum** | Summe der Bytes 0-22 mod 256 |

**Beispiel**:

```
00                          Block Type (Header)
48 45 4C 4C 4F 20 20 20    Filename "HELLO   "
20 20 20 20 20 20 20 20    (mit Leerzeichen aufgefüllt)
00 04                       Load Address = 0x0400
00 02                       Data Length = 0x0200 (512 bytes)
00 04                       Execution Address = 0x0400
7B                          Checksum
```

### Daten-Block

**Struktur**:
- N Bytes Daten (maximal 128 Bytes pro Block)
- 1 Byte Prüfsumme (Summe aller Daten-Bytes mod 256)

**TAP-Format**: Zusätzlich 1 Byte Block-Nummer vor den Daten

```
[Block-Nr] [Data 0..127] [Checksum]
```

### Silence/Pause zwischen Blöcken

- **Default-Modus**: ~0.1 Sekunden (4400 Samples @ 48kHz)
- **Turbo-Modus**: Keine Pause (0 Samples)

---

## Dekodierungsverfahren

Es gibt zwei Hauptmethoden zur Dekodierung von KC85-Kassetten:

### 1. Pulse Duration Method (Halbperioden-Messung)

**Prinzip**: Misst die Länge von Halbperioden zwischen Zero-Crossings

**Schritte**:
1. Erkenne Nulldurchgänge (Sample-Vorzeichen wechselt)
2. Messe Zeit zwischen zwei Nulldurchgängen (Halbperiode)
3. Kombiniere zwei Halbperioden zu einer vollen Periode
4. Klassifiziere Periode nach Länge → Bit-Wert

**Vorteile**:
- Schnelle Reaktion (nach einer Halbperiode)
- Funktioniert mit verschiedenen Sample-Raten

**Nachteile**:
- Empfindlich gegenüber Amplitudenschwankungen
- Übersteuerung kann problematisch sein

**Sample-Rate**: 48000 Hz (typisch)

**Implementation**: `kc85-decoder.js` (Standard)

### 2. Zero-Crossing Method (Vollperioden-Messung)

**Prinzip**: Misst vollständige Oszillationen (3 Nulldurchgänge)

**Schritte**:
1. Erkenne Nulldurchgänge
2. Sammle 3 aufeinanderfolgende Nulldurchgänge
3. Messe Abstand zwischen 1. und 3. Nulldurchgang (volle Periode)
4. Validiere Symmetrie: Halbperiode 1 ≈ Halbperiode 2 (±30%)
5. Klassifiziere nach Frequenz → Bit-Wert

**Frequenz-Mapping** (bei 44100 Hz):

| Bit | Frequenz | Samples | Toleranz (±20%) |
|-----|----------|---------|-----------------|
| '0' | 1950 Hz | ~23 | 18-28 Samples |
| '1' | 1050 Hz | ~42 | 34-50 Samples |
| Separator | 557 Hz | ~79 | 63-95 Samples |

**Vorteile**:
- ✅ **Amplituden-unabhängig** (nur Nulldurchgänge zählen)
- ✅ **Übersteuerung erwünscht** (klare Rechteck-Signale)
- ✅ **Rausch-resistent** (kleine Schwankungen ignoriert)
- ✅ **Volle Schwingung**: Höhere Genauigkeit
- ✅ **Validierung**: Symmetrie-Prüfung

**Nachteile**:
- ⚠️ Benötigt 44100 Hz Sample-Rate
- ⚠️ Signal sollte übersteuert sein

**Sample-Rate**: 44100 Hz (wie KcTapeTool)

**Implementation**: Basierend auf KcTapeTool-Verfahren

### Vergleich der Methoden

| Aspekt | Pulse Duration | Zero-Crossing |
|--------|----------------|---------------|
| **Sample-Rate** | 48000 Hz | 44100 Hz |
| **Messung** | Halbperioden | Volle Oszillationen |
| **Referenz** | Zeitmessung | Nulldurchgänge |
| **Amplitude** | Relevant | **Irrelevant** |
| **Übersteuerung** | Problematisch | **Erwünscht** |
| **Rauschfestigkeit** | Mittel | Hoch |
| **Ursprung** | Eigenentwicklung | KcTapeTool |

---

## Best Practices für Aufnahme und Wiedergabe

### Aufnahme vom Original-Kassettenrekorder

#### Hardware-Setup

**Verbindungen**:
```
Kassettenrekorder → Audio-Kabel → Line-In / Mikrofon-Eingang → PC
```

**Empfohlene Einstellungen**:
- **Eingang**: Line-In (bevorzugt) oder externes USB-Audio-Interface
- **Sample-Rate**: 44100 Hz oder 48000 Hz
- **Bit-Tiefe**: 16-bit oder höher
- **Kanäle**: Mono ausreichend (Stereo funktioniert auch)

#### Audio-Einstellungen

**Lautstärke**:
- ⚠️ **WICHTIG**: **Maximale oder nahezu maximale Lautstärke einstellen!**
- **Übersteuerung ist erwünscht** für klare Nulldurchgänge
- Ziel: Rechteck-ähnliche Signale

**Audio-Verarbeitung deaktivieren**:
- ❌ Echo-Unterdrückung: AUS
- ❌ Rauschunterdrückung: AUS  
- ❌ Automatic Gain Control (AGC): AUS

#### Kassettenrekorder-Einstellungen

- **Geschwindigkeit**: Normale Wiedergabegeschwindigkeit
- **Tonqualität**: Höchste Einstellung
- **Kopf-Reinigung**: Kassettenkopf vor Aufnahme reinigen

#### Aufnahme-Workflow

1. **Vorbereitung**: 
   - Kassette auf Anfang zurückspulen
   - Kassettenkopf reinigen
   - Verbindungen prüfen

2. **Test-Aufnahme**:
   - Kurze Probe-Aufnahme (5-10 Sekunden)
   - Signal-Level prüfen (sollte übersteuern)
   - Zero-Crossings sollten deutlich sichtbar sein

3. **Haupt-Aufnahme**:
   - Kassettenrekorder starten
   - Aufnahme-Software starten  
   - Warten auf Pilot-Tone (sollte innerhalb von Sekunden erkannt werden)
   - Bei Fehler: Sofort abbrechen und Lautstärke anpassen

4. **Signal-Qualitätsprüfung**:
   - Pilot-Tone sollte nach 1-5 Sekunden erkannt werden
   - Sync-Signal sollte nach weiteren 1-2 Sekunden folgen
   - Bytes sollten kontinuierlich dekodiert werden

### Wiedergabe (Tape → KC85)

#### Generierung von Audio aus Tape-Dateien

**Turbo vs. Default**:

| Modus | Pilot-Tone (1. Block) | Pilot-Tone (weitere) | Pause zwischen Blöcken | Geschwindigkeit |
|-------|----------------------|---------------------|------------------------|-----------------|
| **Default** | 8000 Pulse | 160 Pulse | 0.1s (4400 Samples) | Normal |
| **Turbo** | 8000 Pulse | 0 Pulse | 0s (0 Samples) | ~2-3× schneller |

**Wellenform-Generierung**:
- Verwendung von **Rechteck-ähnlichen Wellen**
- Rampen an Übergängen (Samples 0-3) zur Vermeidung von Klicks
- Symmetrische positive/negative Halbwellen

**KC85Player-Konfiguration**:
```javascript
KC85Config = {
    default: {
        zero: 2000,      // Bit 0 Frequenz
        one: 1100,       // Bit 1 Frequenz
        stop: 550,       // Stop-Bit Frequenz
        first: 8000,     // Pilot-Pulse für 1. Block
        block: 160,      // Pilot-Pulse für weitere Blöcke
        silence: 4400    // Pause zwischen Blöcken
    },
    turbo: {
        silence: 0,
        block: 0
    }
}
```

#### Verbindung PC → KC85

```
PC Audio-Ausgang → Audio-Kabel → KC85 Kassetteneingang
```

**Empfehlungen**:
- **Lautstärke**: Beginne mit mittlerer Lautstärke, erhöhe bei Bedarf
- **Kabel-Qualität**: Abgeschirmtes Audio-Kabel verwenden
- **Masse-Verbindung**: Beide Geräte erden (Brumm-Schleifen vermeiden)

### Fehlerdiagnose

#### Kein Pilot-Tone erkannt

**Ursachen**:
- ❌ Lautstärke zu niedrig
- ❌ Falsche Audio-Quelle ausgewählt
- ❌ Kassette leer/defekt

**Lösung**:
- ✅ Lautstärke auf Maximum
- ✅ Richtigen Eingang wählen (Line-In, Microphone)
- ✅ Pegelanzeige prüfen

#### Sync nach Pilot-Tone nicht erkannt

**Ursachen**:
- ❌ Signal zu schwach
- ❌ Rauschunterdrückung aktiv
- ❌ Falsche Sample-Rate

**Lösung**:
- ✅ Übersteuerung zulassen
- ✅ Audio-Verarbeitung deaktivieren
- ✅ Sample-Rate auf 44100/48000 Hz

#### Parity-Fehler / Checksum-Fehler

**Ursachen**:
- ❌ Kassette beschädigt/abgenutzt
- ❌ Kassettenkopf verschmutzt
- ❌ Zu viel Rauschen

**Lösung**:
- ✅ Mehrere Lese-Versuche
- ✅ Kassettenkopf reinigen
- ✅ Andere Kassette testen

---

## Programme und Tools

### PC-Software für KC85-Kassetten

#### 1. **KcTapeTool** (Java) ⭐ Empfohlen

**Plattform**: Windows, Linux, macOS (Java 17+)

**GitHub**: https://github.com/Hojoe42/KcTapeTool

**Funktionen**:
- ✅ Lesen von Kassetten-Audio (WAV, Sound-Eingang)
- ✅ Schreiben von KCC-Dateien zu Audio (Sound-Ausgang, WAV)
- ✅ Zero-Crossing Dekodierung (robust)
- ✅ Unterstützung für KCC, TAP, WAV
- ✅ Command-Line Interface
- ✅ Live-Dekodierung vom Kassettenrekorder

**Installation**:
1. Java 21 installieren (Oracle oder Adoptium)
2. KcTapeTool von Releases herunterladen
3. Archiv entpacken

**Verwendung**:

```bash
# Hilfe anzeigen
KcTapeTool.bat --help

# Sound-Geräte auflisten
KcTapeTool.bat -l

# Von Kassette lesen (Sound-Eingang)
KcTapeTool.bat -s "Eingang" --wait=60

# Von WAV-Datei lesen
KcTapeTool.bat -s tape.wav

# Zu Audio ausgeben (Sound-Ausgang)
KcTapeTool.bat -s PROGRAMM.KCC -d "Lautsprecher"

# KCC zu WAV konvertieren
KcTapeTool.bat -s PROGRAMM.KCC -d output.wav
```

**Besonderheiten**:
- Verwendet 44100 Hz Sample-Rate
- Sehr robust bei übersteuertem Signal
- Empfiehlt maximale Lautstärke
- Wartet standardmäßig 60 Sekunden auf Signal

**Versionen**:
- v0.2.1 (aktuell): Fix für TAP mit 0-indiziert Blocknummern
- v0.2.0: TAP-Support
- v0.1.0: KCC und Audio grundlegend

#### 2. **Web-basierter KC85 Tape Player** (JavaScript)

**Plattform**: Browser (Chrome, Firefox, Safari)

**Dieses Repository**: Flask + Web Audio API

**Funktionen**:
- ✅ Abspielen von KCC/TAP/SSS-Dateien im Browser
- ✅ Echtzeit-Dekodierung vom Mikrofon
- ✅ Live-Feedback während Aufnahme
- ✅ Download dekodierter Dateien
- ✅ Turbo-Modus für schnellere Wiedergabe

**Verwendung**:

```bash
# Server starten
python app.py

# Browser öffnen
http://localhost:5000
```

**Features**:
- `kc85-player.js`: Wiedergabe (KCC → Audio)
- `kc85-decoder.js`: Aufnahme (Audio → KCC)
- Echtzeit-Dekodierung (Realtime Streaming)
- Visuelles Audio-Level-Meter
- Progress-Tracking

**Demo-Seiten**:
- `index.html`: Player mit Tape-Bibliothek
- `decoder-demo.html`: Echtzeit-Dekodierung

#### 3. **KCEmu** (KC85-Emulator)

**Plattform**: Windows, Linux

**Funktionen**:
- Vollständige KC85-Emulation (KC 85/2, 85/3, 85/4)
- Laden von KCC/TAP-Dateien
- Virtuelle Kassetten-Laufwerke
- Bildschirm, Tastatur, Module

**Verwendung**: Zum Testen dekodierter Dateien

#### 4. **JAVCr / KC85-Utils** (Diverse Tools)

**Plattform**: Windows/DOS

**Funktionen**:
- Format-Konvertierung
- Tape-Image-Verwaltung
- Checksum-Validierung

### Online-Ressourcen

- **KC85.info**: http://www.kc85.info/ (Downloads, Handbücher, Software)
- **KC-Club**: http://www.kcclub.de/ (Community, KC-News, Archive)
- **KC85emu.de**: http://www.kc85emu.de/ (Emulator, Software-Archive)
- **HC-DDR Wiki**: https://hc-ddr.hucki.net/ (Dokumentation zu DDR-Homecomputern)

---

## Implementierungsdetails

Diese Sektion beschreibt, wie man einen eigenen KC85-Kassetten-Encoder/Decoder implementiert.

### Minimal-Implementierung: Decoder

#### Erforderliche Komponenten

1. **Audio-Eingabe**: Mikrofon, Line-In, WAV-Datei
2. **Sample-Rate**: 44100 Hz oder 48000 Hz
3. **Nulldurchgangs-Erkennung**
4. **Puls-Klassifikation**
5. **Byte-Assemblierung**
6. **Header-Parsing**

#### Dekodierungs-Pipeline

```
Audio Stream (PCM)
      ↓
[1. Zero-Crossing Detection]
      ↓
Pulse Durations
      ↓
[2. Pulse Classification]
      ↓
Bits (0, 1, S)
      ↓
[3. Pilot Tone & Sync Detection]
      ↓
Data Bits
      ↓
[4. Byte Assembly]
      ↓
Bytes (raw)
      ↓
[5. Header Parsing]
      ↓
Header Metadata
      ↓
[6. Data Block Extraction]
      ↓
Decoded File (KCC)
```

#### Implementierungs-Pseudocode

```javascript
class KC85Decoder {
    constructor(config) {
        this.sampleRate = 44100; // oder 48000
        
        // Pulse-Schwellwerte (Sekunden)
        this.shortPulseMin = 0.0003;  // 0.3 ms
        this.shortPulseMax = 0.0007;  // 0.7 ms (Bit 0)
        this.longPulseMin = 0.0007;   // 0.7 ms
        this.longPulseMax = 0.0013;   // 1.3 ms (Bit 1)
        this.stopPulseMin = 0.0013;   // 1.3 ms
        this.stopPulseMax = 0.0025;   // 2.5 ms (Stop)
        
        // State
        this.lastZeroCrossing = 0;
        this.lastSign = 0;
        this.pilotCount = 0;
        this.syncDetected = false;
        this.decodedBits = [];
        this.decodedBytes = [];
    }
    
    processAudioSample(sample, sampleIndex) {
        // 1. Zero-Crossing Detection
        const currentSign = sample > 0 ? 1 : -1;
        
        if (currentSign !== this.lastSign && this.lastSign !== 0) {
            // Zero-Crossing!
            const duration = (sampleIndex - this.lastZeroCrossing) / this.sampleRate;
            
            // 2. Pulse Classification
            let bit = this.classifyPulse(duration);
            
            if (bit !== null) {
                // 3. Pilot Tone & Sync
                if (!this.syncDetected) {
                    this.detectSync(bit);
                } else {
                    // 4. Collect Data Bits
                    this.decodedBits.push(bit);
                    this.assembleByte();
                }
            }
            
            this.lastZeroCrossing = sampleIndex;
        }
        
        this.lastSign = currentSign;
    }
    
    classifyPulse(duration) {
        if (duration >= this.shortPulseMin && duration <= this.shortPulseMax) {
            return 0;  // Short = Bit 0
        } else if (duration >= this.longPulseMin && duration <= this.longPulseMax) {
            return 1;  // Long = Bit 1
        } else if (duration >= this.stopPulseMin && duration <= this.stopPulseMax) {
            return 'S';  // Stop
        }
        return null;  // Invalid
    }
    
    detectSync(bit) {
        if (bit === 1) {
            this.pilotCount++;
        } else if ((bit === 'S' || bit === 0) && this.pilotCount >= 50) {
            // Sync detected!
            this.syncDetected = true;
            this.decodedBits.push(bit);
        } else {
            this.pilotCount = 0;
        }
    }
    
    assembleByte() {
        // State machine: Start → 8 Data → Parity → Stop
        // [Hier Byte-Assemblierung implementieren]
        // Siehe kc85-decoder.js für vollständige Implementierung
    }
    
    parseHeader(bytes) {
        if (bytes.length < 24) return null;
        
        return {
            blockType: bytes[0],
            filename: String.fromCharCode(...bytes.slice(1, 17)).trim(),
            loadAddress: bytes[17] | (bytes[18] << 8),  // Little-Endian
            dataLength: bytes[19] | (bytes[20] << 8),
            execAddress: bytes[21] | (bytes[22] << 8),
            checksum: bytes[23]
        };
    }
}
```

### Minimal-Implementierung: Encoder

#### Erforderliche Komponenten

1. **Audio-Ausgabe**: Web Audio API, WAV-File-Writer
2. **Sample-Rate**: 48000 Hz (typisch)
3. **Wellenform-Generator** für 3 Frequenzen
4. **Byte-zu-Bits-Konvertierung**
5. **Header-Generierung**

#### Encoding-Pipeline

```
File (KCC/Binary)
      ↓
[1. Parse/Prepare Header]
      ↓
Header Block (24 bytes)
      ↓
[2. Byte to Bits]
      ↓
Bits (0, 1)
      ↓
[3. Add Start/Parity/Stop]
      ↓
Bits with framing
      ↓
[4. Generate Waveforms]
      ↓
Audio Samples (PCM)
      ↓
[5. Output to Audio/WAV]
```

#### Implementierungs-Pseudocode

```javascript
class KC85Encoder {
    constructor(sampleRate = 48000) {
        this.sampleRate = sampleRate;
        
        // Frequenzen
        this.freqZero = 2000;  // Bit 0
        this.freqOne = 1100;   // Bit 1
        this.freqStop = 550;   // Stop
        
        // Wellenformen generieren
        this.waveZero = this.generateWave(this.freqZero);
        this.waveOne = this.generateWave(this.freqOne);
        this.waveStop = this.generateWave(this.freqStop);
    }
    
    generateWave(frequency) {
        const samples = Math.round(this.sampleRate / frequency);
        const wave = new Float32Array(samples);
        const half = samples / 2;
        
        // Rechteck-ähnliche Welle mit Rampen
        for (let i = 0; i < half; i++) {
            if (i < 4) wave[i] = i / 4;        // Rampe
            else wave[i] = 1.0;                // Maximum
        }
        for (let i = half; i < samples; i++) {
            wave[i] = -wave[i - half];         // Negative Halbwelle
        }
        
        return wave;
    }
    
    encodeByte(byte) {
        const audioBuffer = [];
        
        // Start-Bit (0)
        audioBuffer.push(...this.waveZero);
        
        // 8 Data-Bits (LSB first)
        let parity = 0;
        for (let i = 0; i < 8; i++) {
            const bit = (byte >> i) & 1;
            parity ^= bit;
            audioBuffer.push(bit ? this.waveOne : this.waveZero);
        }
        
        // Parity-Bit (ungerade Parität)
        audioBuffer.push(parity === 0 ? this.waveOne : this.waveZero);
        
        // Stop-Bit
        audioBuffer.push(...this.waveStop);
        
        return audioBuffer;
    }
    
    encodeFile(fileData, filename, loadAddr, execAddr) {
        const audioBuffer = [];
        
        // 1. Pilot Tone (8000 × Bit '1')
        for (let i = 0; i < 8000; i++) {
            audioBuffer.push(...this.waveOne);
        }
        
        // 2. Stop (Sync)
        audioBuffer.push(...this.waveStop);
        
        // 3. Header-Block
        const header = this.createHeader(filename, loadAddr, fileData.length, execAddr);
        header.forEach(byte => {
            audioBuffer.push(...this.encodeByte(byte));
        });
        
        // 4. Daten-Blöcke
        fileData.forEach(byte => {
            audioBuffer.push(...this.encodeByte(byte));
        });
        
        return new Float32Array(audioBuffer);
    }
    
    createHeader(filename, loadAddr, dataLength, execAddr) {
        const header = new Uint8Array(24);
        header[0] = 0x00;  // Block Type
        
        // Filename (16 bytes, space-padded)
        const name = filename.padEnd(16, ' ').slice(0, 16);
        for (let i = 0; i < 16; i++) {
            header[1 + i] = name.charCodeAt(i);
        }
        
        // Addresses (Little-Endian)
        header[17] = loadAddr & 0xFF;
        header[18] = (loadAddr >> 8) & 0xFF;
        header[19] = dataLength & 0xFF;
        header[20] = (dataLength >> 8) & 0xFF;
        header[21] = execAddr & 0xFF;
        header[22] = (execAddr >> 8) & 0xFF;
        
        // Checksum
        let sum = 0;
        for (let i = 0; i < 23; i++) sum += header[i];
        header[23] = sum & 0xFF;
        
        return header;
    }
}
```

### Optimierungen und Erweiterungen

#### 1. **Echtzeit-Streaming-Dekodierung**

**Vorteil**: Sofortiges Feedback, frühes Abbruch bei Fehlern

**Implementierung**:
- Audio-Chunks puffern (ScriptProcessorNode / AudioWorklet)
- Nach jedem Chunk Zero-Crossings verarbeiten
- Callbacks für dekodierte Bytes, Header, Fortschritt

**Beispiel**: `kc85-decoder.js` (Real-time Processing)

#### 2. **Fehlerkorrektur**

**Strategien**:
- **Parity-Check**: Ungültige Bytes markieren, aber weiter dekodieren
- **Checksum-Validierung**: Header/Daten-Blöcke prüfen
- **Mehrfach-Lese-Versuche**: Beste Ergebnisse auswählen

#### 3. **Turbo-Modus**

**Optimierung**:
- Keine Pausen zwischen Blöcken
- Kürzere Pilot-Tones (außer 1. Block)
- 2-3× schnellere Ladezeiten

#### 4. **Adaptive Schwellwerte**

**Problem**: Unterschiedliche Kassettenrekorder → verschiedene Frequenzen

**Lösung**:
- Pilot-Tone analysieren → durchschnittliche Frequenz messen
- Schwellwerte dynamisch anpassen
- Toleranz-Bereiche erweitern

#### 5. **Visualisierungen**

**Hilfreich für Debug**:
- Wellenform-Anzeige (Canvas/WebGL)
- Zero-Crossings markieren
- Erkannte Pulse farblich codieren
- Echtzeit-Spektrogramm

---

## Technische Referenzen

### Offizielle Dokumentation

- **KC85/5 Systemhandbuch** - "Magnetbandaufzeichnung"-Kapitel (nicht online verfügbar, aber in KC-Club-Archiven)
- **CAOS-Dokumentation** - Beschreibung der Kassetteninterface-Kommandos

### Open-Source-Projekte

#### KcTapeTool
- **Repository**: https://github.com/Hojoe42/KcTapeTool
- **Sprache**: Java
- **Methode**: Zero-Crossing (Vollperioden)
- **Lizenz**: MIT

#### kc85-tape-player
- **Repository**: https://github.com/chhu/kc85-tape-player (Original)
- **Sprache**: JavaScript (Web Audio API)
- **Methode**: Pulse Duration
- **Lizenz**: Open Source

#### Dieses Repository (kc85-tape-player Fork)
- **Erweiterungen**: Flask-Backend, Echtzeit-Dekodierung
- **Dateien**: `kc85-player.js`, `kc85-decoder.js`
- **Features**: Streaming, Live-Feedback, Turbo-Modus

### Community-Ressourcen

- **KC-Club**: www.kcclub.de
  - KC-News (regelmäßige Publikation)
  - Clubtreffen (jährlich)
  - Software-Archive
  
- **KC85.info**: www.kc85.info
  - Downloads (Software, Handbücher, Schaltpläne)
  - Module-Datenbank
  - CP/M-Ressourcen

- **KC85emu**: www.kc85emu.de
  - Emulator-Downloads
  - Spielothek
  - Dokumentationen

### Literatur

- **Rechnerbasteleien**: Artikel über Z80-Computer und Kassettenformate
- **DDR-Computer-Literatur**: Bücher über KC85, Robotron-Systeme
- **Retro-Computing-Foren**: Diskussion zu Tape-Formaten (CAOS, Z1013, etc.)

### Verwandte Formate

Andere DDR-Computer mit ähnlichen Kassetten-Formaten:

- **Z1013**: Ähnliches FSK-Verfahren
- **Z9001** / **KC87**: Kompatible Formate
- **AC1**: Andere Frequenzen, ähnliches Prinzip
- **LC80**: Sehr einfaches Format

### Werkzeuge und Libraries

**Audio-Verarbeitung**:
- **Web Audio API** (JavaScript, Browser)
- **Java Sound API** (Java)
- **PortAudio** (C/C++)
- **PyAudio** (Python)

**Datei-Konvertierung**:
- **FFmpeg**: WAV-Konvertierung
- **SoX**: Audio-Verarbeitung

**Emulatoren**:
- **KCEmu**: Vollständiger KC85-Emulator
- **JKCEMU**: Java-basierter KC-Emulator

---

## Zusammenfassung

### Kernpunkte

1. **Formate**: KCC (Standard), TAP (Container), SSS, 853/855
2. **Codierung**: FSK mit 3 Frequenzen (2000 Hz, 1100 Hz, 550 Hz)
3. **Struktur**: Pilot-Tone → Sync → Header (24 Bytes) → Daten + Checksums
4. **Dekodierung**: Pulse Duration oder Zero-Crossing (robuster)
5. **Best Practice**: Maximale Lautstärke, Übersteuerung erwünscht, 44100 Hz
6. **Tools**: KcTapeTool (Java), Web-basierter Player (JavaScript)

### Empfehlungen

**Für Anfänger**:
1. **KcTapeTool** herunterladen und ausprobieren
2. Mit WAV-Dateien starten (einfacher als Live-Aufnahme)
3. Default-Einstellungen verwenden (funktioniert meist gut)

**Für Fortgeschrittene**:
1. **Web-basierter Decoder** für Echtzeit-Feedback
2. Zero-Crossing-Methode für bessere Robustheit
3. Eigene Filter und Optimierungen entwickeln

**Für Entwickler**:
1. Quellcode von KcTapeTool und kc85-decoder.js studieren
2. Implementierungs-Pseudocode als Basis verwenden
3. Mit verschiedenen Sample-Raten und Toleranzen experimentieren

---

## Changelog

**Version 1.0** (Februar 2026)
- Initiale umfassende Dokumentation
- Basierend auf KcTapeTool, kc85-tape-player, Web-Recherche
- Alle Formate, Audio-Codierung, Best Practices dokumentiert

---

## Lizenz und Credits

**Dokumentation**: Zusammengestellt aus öffentlich verfügbaren Quellen

**Quellen**:
- KcTapeTool (Holger Jödicke) - MIT Lizenz
- kc85-tape-player (chhu) - Open Source
- KC85-Community (KC-Club, KC85.info)
- Eigene Implementierungen und Experimente

**Autor dieser Dokumentation**: Basierend auf umfangreicher Recherche und Code-Analyse

---

**Ende der Dokumentation**
