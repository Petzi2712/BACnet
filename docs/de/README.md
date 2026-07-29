# BACnet-Client für ioBroker

`bacnet-client` ist ein eigenständiger BACnet/IP-Client und Datensammler für ioBroker. Der Adapter funktioniert ohne zusätzliche GLT- oder Visualisierungsadapter. BACnet-Geräte liefern die Daten; ioBroker-Objekte und -States bilden die stabile Schnittstelle für Skripte, Visualisierungen und History-Adapter.

## Ablauf

1. Unter **Netzwerk** lokale IPv4-Adresse, UDP-Port (Standard 47808), Broadcast und optionale gerichtete Ziele einstellen.
2. Unter **Discovery** den Scan starten. Nur eine Scan-Generation läuft gleichzeitig und kann abgebrochen werden.
3. Die Geräteliste prüfen. Doppelte Device Instances sind Konflikte und werden nicht automatisch ausgewählt.
4. Alle konfliktfreien Geräte oder eine über den Message-Befehl gewählte Liste importieren.
5. Polling und optional COV einstellen. Schreibzugriff nur nach bewusster Freigabe aktivieren.

Ein Broadcast bleibt normalerweise im lokalen Subnetz. Für andere Subnetze sind gerichtete Ziele oder vorhandene BACnet-Router erforderlich. Docker-Netzwerkmodus, VLAN-Regeln, Firewall und belegte UDP-Ports müssen vor Ort geprüft werden. BBMD/Foreign Device Registration und BACnet/SC gehören nicht zum MVP.

## Objektbaum

Die technische Identität entsteht ausschließlich aus Device Instance, Object Type, Object Instance und Property ID:

```text
bacnet-client.0.devices.d_1234.types.analog_input.o_7.present_value
```

Namen, Beschreibungen, Standort, Hersteller, Modell und Alias ändern diese ID nicht. Proprietäre Typen und Properties bleiben als `type_128` beziehungsweise `p_512` erhalten. Komplexe Daten werden verlustarm als JSON-String gespeichert, wenn kein sicherer primitiver Mapper existiert.

## Import

Die `Object_List` wird zuerst an Array-Index 0 nach ihrer Länge und anschließend indexweise mit begrenzter Parallelität gelesen. Der Adapter versucht je Objekt `Property_List`. Fehlt sie, werden wichtige Standardproperties einzeln gelesen und das Objekt als `partial` markiert. Große ReadPropertyMultiple-Anfragen werden in kleine Batches geteilt; bei Reject, Abort, Segmentierungsfehler oder Timeout erfolgt der Fallback auf ReadProperty.

Ein erneuter Import aktualisiert bestehende Objekte. Der Gerätebaum wird weder beim Start noch beim Import pauschal gelöscht. Fehlende Einträge werden zunächst als stale behandelt; kontrollierte Bereinigung verlangt erfolgreiche Vollscans und eine ausdrückliche Bereinigungsentscheidung.

## Polling, COV und Schreiben

Pollzyklen überlappen nicht. Globale und gerätespezifische Requests bleiben durch Queues begrenzt. Geeignete Objekte können COV verwenden; Abos werden erneuert und beim Stoppen abgemeldet. Fehler führen zurück zu Polling.

Schreiben ist standardmäßig aus. Zusätzlich zur globalen Freigabe muss die vollständige stabile ID in der Allowlist stehen. Unterstützt wird `Present_Value` für geeignete Analog-/Binary-/Multi-State Output- und Value-Objekte. Priorität 1 bis 16 ist konfigurierbar; `null` gibt die gewählte Priorität frei. Erst eine bestätigte Rücklesung wird mit `ack: true` gespeichert.

## Diagnose

- **Port belegt:** anderen BACnet-Client stoppen oder Port ändern.
- **Keine I-Am-Antwort:** Interface, Broadcast, Firewall, VLAN und gerichtete Ziele prüfen.
- **Duplicate Device Instance:** BACnet-Konfiguration korrigieren; der Adapter wählt kein Gerät stillschweigend.
- **Property-Liste unvollständig:** Gerät unterstützt `Property_List` nicht; Import bleibt sichtbar `partial`.
- **APDU-Probleme:** Timeout erhöhen, Parallelität reduzieren, Max APDU und Segmentierung prüfen.

`getDiagnostics` liefert Socket, aktiven Job, Queue und Zähler ohne Prozesswerte. Es gibt keine Telemetrie. Aktuelle Werte liegen als ioBroker-States vor; Langzeitarchivierung bleibt Aufgabe der normalen History-/Datenbankadapter.

## Grenzen

Direktes MS/TP, BACnet/SC, eine vollständige BBMD/Foreign-Device-Lösung und semantische Decoder für alle komplexen BACnet-Strukturen sind nicht Bestandteil von 0.1.0. MS/TP-Geräte können über einen vorhandenen BACnet-Router erscheinen.
