# KC85 Zero-Crossing Decoder

## Übersicht

Der **Zero-Crossing Decoder** ist eine alternative Implementierung der KC85-Tape-Dekodierung, die auf dem Verfahren aus dem [KcTapeTool](https://github.com/Hojoe42/KcTapeTool) von Holger Jödicke basiert.

## Funktionsweise

### Nulldurchgangs-Erkennung

Im Gegensatz zur Pulse-Duration-Methode, die Halbperioden misst, basiert diese Methode auf der Detektion von **Nulldurchgängen** (Zero Crossings) im Signal:

1. **Zero Crossing Detection**: Erkennt Vorzeichenwechsel im Audiosignal
2. **Oszillations-Messung**: Misst die Länge zwischen 3 aufeinanderfolgenden Nulldurchgängen (eine vollständige Schwingung)
3. **Frequenz-Bestimmung**: Ordnet die gemessene Länge einer der drei KC85-Frequenzen zu

### Frequenz-Mapping

Die KC85-Kassetten verwenden FSK (Frequency Shift Keying) mit drei Frequenzen:

| Bit-Typ | Frequenz | Samples @ 44100 Hz | Toleranz (±20%) |
|---------|----------|-------------------|-----------------|
| Bit '0' | 1950 Hz  | ~23 Samples       | 18-28 Samples   |
| Bit '1' | 1050 Hz  | ~42 Samples       | 34-50 Samples   |
| Separator | 557 Hz | ~79 Samples       | 63-95 Samples   |

### Algorithmus

```javascript
// 1. Nulldurchgang detektieren
if (Math.abs(sample) > threshold) {
    const currentSign = sample > 0 ? 1 : -1;
    
    if (currentSign !== lastSign) {
        // Nulldurchgang gefunden!
        zeroCrossings.push(currentPosition);
    }
}

// 2. Oszillation analysieren (3 Nulldurchgänge = 1 volle Schwingung)
if (zeroCrossings.length >= 3) {
    const crossing1 = zeroCrossings[0];
    const crossing2 = zeroCrossings[1];
    const crossing3 = zeroCrossings[2];
    
    const fullPeriod = crossing3 - crossing1;
    
    // 3. Validierung: Halbperioden sollten ähnlich sein
    const halfPeriod1 = crossing2 - crossing1;
    const halfPeriod2 = crossing3 - crossing2;
    
    if (halfPeriod2 ~= halfPeriod1 ± 30%) {
        // Gültige Schwingung
    }
    
    // 4. Frequenz bestimmen
    if (fullPeriod ~= 23 ± 20%) -> Bit 0
    if (fullPeriod ~= 42 ± 20%) -> Bit 1
    if (fullPeriod ~= 79 ± 20%) -> Separator
}
```

### Byte-Assemblierung

Nach der Synchronisation:

1. **Pilot Tone**: Mindestens 20 aufeinanderfolgende '1'-Bits
2. **Sync**: Erster Separator nach Pilot Tone markiert Daten-Beginn
3. **Daten-Format**: 8 Bits (LSB first) + 1 Separator
4. **Byte-Erzeugung**: Bits werden zu Bytes zusammengesetzt

## Vorteile gegenüber Pulse Duration

### ✅ Robustheit
- **Amplituden-unabhängig**: Nur Nulldurchgänge zählen, nicht die Amplitude
- **Übersteuerung erwünscht**: Klare Rechteck-Signale erzeugen deutliche Nulldurchgänge
- **Rausch-resistent**: Kleine Amplituden-Schwankungen werden ignoriert

### ✅ Genauigkeit
- **Volle Schwingung**: Misst komplette Oszillationen statt Halbperioden
- **Validierung**: Prüft Symmetrie der Halbperioden
- **KcTapeTool-kompatibel**: Verwendet dieselben Frequenzen und Toleranzen

### ⚠️ Anforderungen
- Benötigt 44100 Hz Samplerate (wie KcTapeTool)
- Signal sollte möglichst übersteuert sein für klare Nulldurchgänge
- Minimal-Abstand zwischen Nulldurchgängen verhindert Rausch-Fehlerkennung

## Vergleich der Methoden

| Aspekt | Pulse Duration | Zero-Crossing |
|--------|----------------|---------------|
| **Samplerate** | 48000 Hz | 44100 Hz |
| **Messung** | Halbperioden | Volle Oszillationen |
| **Referenz** | Zeitmessung | Nulldurchgänge |
| **Amplitude** | Relevant | Irrelevant |
| **Übersteuerung** | Problematisch | Erwünscht |
| **Ursprung** | Eigenentwicklung | KcTapeTool-inspiriert |

## Verwendung

### In HTML
```html
<button onclick="startDecoding('zerocrossing')">Zero-Crossing Method</button>
```

### In JavaScript
```javascript
const decoder = new KC85ZeroCrossingDecoder({
    debug: true,
    sampleRate: 44100,
    onProgress: (msg) => console.log(msg),
    onDataDecoded: (data) => console.log(`Byte: 0x${data.hex}`)
});

await decoder.startRecording();
```

## Konfiguration

```javascript
{
    sampleRate: 44100,              // Wie KcTapeTool
    trennFrequenz: 557,             // Separator-Frequenz
    einsFrequenz: 1050,             // Bit '1' Frequenz
    nullFrequenz: 1950,             // Bit '0' Frequenz
    toleranceMin: 0.8,              // -20% Toleranz
    toleranceMax: 1.2,              // +20% Toleranz
    zeroCrossingThreshold: 0.01,    // Minimale Amplitude für Nulldurchgang
    minZeroCrossingGap: 5,          // Min. Abstand (Sample-Rausch-Filter)
    pilotToneMinBits: 20,           // Min. Pilot-Tone-Länge
    debug: false
}
```

## Debugging

Bei aktiviertem Debug-Modus werden folgende Informationen geloggt:

- Anzahl der Pilot-Tone-Bits
- Sync-Detection mit genauer Bit-Anzahl
- Jedes dekodierte Byte mit Hex-Wert
- Warnungen bei unvollständigen Bytes
- Header-Parsing-Ergebnisse

## Fehlerbehandlung

### Typische Probleme

**Problem**: Kein Sync erkannt
- **Lösung**: Audio-Level erhöhen, mehr Übersteuerung zulassen

**Problem**: Viele ungültige Oszillationen
- **Lösung**: Threshold für Nulldurchgänge anpassen

**Problem**: Bytes mit weniger als 8 Bits
- **Lösung**: Signal-Qualität verbessern, Störgeräusche reduzieren

## Referenzen

- [KcTapeTool GitHub](https://github.com/Hojoe42/KcTapeTool) - Original Java-Implementierung
- `NullDurchgangWaveAnalyzer.java` - Kern-Algorithmus
- `Kc85xSchwingungKonfig.java` - Frequenz-Definitionen
- `BitKonfig.java` - Toleranz-Berechnung

## Lizenz

Basierend auf dem Open-Source KcTapeTool-Projekt.
