# BACnet-Client für ioBroker

`bacnet-client` ist ein eigenständiger BACnet/IP-Client und Datensammler für ioBroker. Der Adapter funktioniert ohne zusätzliche GLT- oder Visualisierungsadapter. BACnet-Geräte liefern die Daten; ioBroker-Objekte und -States bilden die stabile Schnittstelle für Skripte, Visualisierungen und History-Adapter.

## Neues Gerät einlesen

1. Unter **Netzwerk** lokale IPv4-Adresse, UDP-Port (Standard 47808), Broadcast und optionale gerichtete Ziele einstellen.
2. Einstellungen speichern und prüfen, dass die Adapterinstanz läuft.
3. Unter **Geräte & Datenpunkte** auf **Discovery starten** klicken. Nur eine Scan-Generation läuft gleichzeitig und kann abgebrochen werden.
4. Die Geräteliste prüfen. Ein grüner Punkt kennzeichnet ein im letzten Scan aktives Gerät; ein roter Punkt ein bekanntes, aber aktuell nicht antwortendes Gerät. Doppelte Device Instances sind Konflikte.
5. Das Gerät aufklappen und **Gerät einlesen** wählen. Dadurch werden `Object_List` und verfügbare Properties als Inventar geladen, aber noch nicht pauschal im Objektbaum angelegt.
6. Optional eine eigene Beschreibung wie „Lüftungsanlage Gebäude A“ eintragen.
7. Über die Volltextsuche nach Gerätenamen, Beschreibung, Hersteller, Objekt, Property oder stabiler ID suchen.
8. Nur die benötigten Datenpunkte per Checkbox auswählen und die Adaptereinstellungen speichern.
9. Wird eine Checkbox später entfernt und erneut gespeichert, löscht der Adapter den State und inzwischen leere Objekt-/Typ-/Gerätepfade aus dem Objektbaum.

Polling und optional COV anschließend passend einstellen. Nur ausgewählte `Present_Value`-Punkte werden zyklisch gelesen oder per COV abonniert. Schreibzugriff nur nach bewusster Freigabe aktivieren.

Ein Broadcast bleibt normalerweise im lokalen Subnetz. Für andere Subnetze sind gerichtete Ziele oder vorhandene BACnet-Router erforderlich. Docker-Netzwerkmodus, VLAN-Regeln, Firewall und belegte UDP-Ports müssen vor Ort geprüft werden. BBMD/Foreign Device Registration und BACnet/SC gehören nicht zum MVP.

## Objektbaum

Die technische Identität entsteht ausschließlich aus Device Instance, Object Type, Object Instance und Property ID:

```text
bacnet-client.0.devices.d_1234.types.analog_input.o_7.present_value
```

Namen, Beschreibungen, Standort, Hersteller, Modell und Alias ändern diese ID nicht. Proprietäre Typen und Properties bleiben als `type_128` beziehungsweise `p_512` erhalten. Komplexe Daten werden verlustarm als JSON-String gespeichert, wenn kein sicherer primitiver Mapper existiert.

## Import

Die `Object_List` wird zuerst an Array-Index 0 nach ihrer Länge und anschließend indexweise mit begrenzter Parallelität gelesen. Der Adapter versucht je Objekt `Property_List`. Fehlt sie, werden wichtige Standardproperties einzeln gelesen und das Objekt als `partial` markiert. Große ReadPropertyMultiple-Anfragen werden in kleine Batches geteilt; bei Reject, Abort, Segmentierungsfehler oder Timeout erfolgt der Fallback auf ReadProperty.

Ein erneutes Einlesen aktualisiert das Inventar. Im Objektbaum werden ausschließlich ausgewählte Punkte angelegt. Abgewählte States und nicht mehr benötigte leere Pfade werden kontrolliert entfernt; andere Adapterobjekte außerhalb von `bacnet-client.<Instanz>.devices` bleiben unberührt.

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

Direktes MS/TP, BACnet/SC, eine vollständige BBMD/Foreign-Device-Lösung und semantische Decoder für alle komplexen BACnet-Strukturen sind nicht Bestandteil von 0.2.0. MS/TP-Geräte können über einen vorhandenen BACnet-Router erscheinen.
