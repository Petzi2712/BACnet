"use strict";

window.systemDictionary = {
	subtitle: {
		en: "Discover BACnet/IP devices and expose only the data points you actually need.",
		de: "BACnet/IP-Geräte finden und nur die wirklich benötigten Datenpunkte im Objektbaum anlegen."
	},
	devicesAndPoints: { en: "Devices & data points", de: "Geräte & Datenpunkte" },
	network: { en: "Network", de: "Netzwerk" },
	pollingAndWriting: { en: "Polling & writing", de: "Abfrage & Schreiben" },
	diagnostics: { en: "Diagnostics", de: "Diagnose" },
	inventory: { en: "Inventory", de: "Inventar" },
	availableDevices: { en: "Available devices", de: "Verfügbare Geräte" },
	deviceSelectionHelp: {
		en: "Run discovery, read a device inventory, then select only the points that should exist in the ioBroker object tree. Saving removes deselected points and empty paths.",
		de: "Gerätesuche starten, das Geräteinventar einlesen und anschließend nur die Punkte auswählen, die im ioBroker-Objektbaum erscheinen sollen. Beim Speichern werden abgewählte Punkte und leere Pfade entfernt."
	},
	active: { en: "Active", de: "Aktiv" },
	inactive: { en: "Inactive", de: "Inaktiv" },
	startDiscovery: { en: "Start discovery", de: "Gerätesuche starten" },
	cancelDiscovery: { en: "Cancel discovery", de: "Gerätesuche abbrechen" },
	refreshList: { en: "Refresh list", de: "Liste aktualisieren" },
	readAllDevices: { en: "Read all devices", de: "Alle Geräte einlesen" },
	fullTextSearch: { en: "Full-text search", de: "Volltextsuche" },
	searchPlaceholder: {
		en: "Search device, description, vendor, object, property or stable ID…",
		de: "Gerät, Beschreibung, Hersteller, Objekt, Eigenschaft oder stabile ID suchen…"
	},
	deviceInstance: { en: "Device instance", de: "Geräteinstanz" },
	points: { en: "points", de: "Punkte" },
	notRead: { en: "Inventory not read", de: "Inventar nicht eingelesen" },
	manualDescription: { en: "Manual device description", de: "Manuelle Gerätebeschreibung" },
	descriptionPlaceholder: {
		en: "e.g. ventilation unit, building A, roof",
		de: "z. B. Lüftungsanlage, Gebäude A, Dach"
	},
	pointDescription: { en: "Description / object name", de: "Beschreibung / Objektname" },
	pointUnit: { en: "Unit", de: "Einheit" },
	unitPlaceholder: { en: "e.g. °C, %, kWh", de: "z. B. °C, %, kWh" },
	rereadDevice: { en: "Re-read device", de: "Gerät neu einlesen" },
	readDevice: { en: "Read device", de: "Gerät einlesen" },
	selectVisible: { en: "Select visible", de: "Sichtbare auswählen" },
	deselectVisible: { en: "Deselect visible", de: "Sichtbare abwählen" },
	deviceConflict: {
		en: "Duplicate BACnet Device Instance detected. Correct the network configuration before importing.",
		de: "Doppelte BACnet-Geräteinstanz erkannt. Vor dem Import muss die Netzwerkkonfiguration korrigiert werden."
	},
	noPointsMatch: { en: "No data points match the current search.", de: "Keine Datenpunkte entsprechen der aktuellen Suche." },
	readDeviceFirst: {
		en: "Read this device first to make its available data points selectable.",
		de: "Dieses Gerät zuerst einlesen, damit seine verfügbaren Datenpunkte ausgewählt werden können."
	},
	noDevices: {
		en: "No devices are known yet. Start discovery while the adapter instance is running.",
		de: "Noch keine Geräte bekannt. Gerätesuche starten, während die Adapterinstanz läuft."
	},
	devices: { en: "devices", de: "Geräte" },
	selectedPoints: { en: "selected points", de: "ausgewählte Punkte" },
	connection: { en: "Connection", de: "Verbindung" },
	networkHelp: {
		en: "Configure the local BACnet/IP interface, UDP port and directed discovery targets.",
		de: "Lokale BACnet/IP-Schnittstelle, UDP-Port und gerichtete Discovery-Ziele konfigurieren."
	},
	bindAddress: { en: "Local IPv4 bind address", de: "Lokale IPv4-Bind-Adresse" },
	subnetCidr: { en: "Subnet mask / CIDR", de: "Subnetzmaske / CIDR" },
	broadcastAddress: { en: "Broadcast address", de: "Broadcast-Adresse" },
	port: { en: "BACnet UDP port", de: "BACnet-UDP-Port" },
	additionalTargets: { en: "Additional broadcast or unicast targets", de: "Weitere Broadcast- oder Unicast-Ziele" },
	listInputHelp: { en: "One entry per line; comma and semicolon are also accepted.", de: "Ein Eintrag pro Zeile; Komma und Semikolon werden ebenfalls akzeptiert." },
	discoveryTimeoutMs: { en: "Discovery window (ms)", de: "Zeitfenster der Gerätesuche (ms)" },
	apduTimeoutMs: { en: "APDU timeout (ms)", de: "APDU-Timeout (ms)" },
	retries: { en: "Retries", de: "Wiederholungen" },
	lowLimit: { en: "Lowest device instance", de: "Kleinste Geräteinstanz" },
	highLimit: { en: "Highest device instance", de: "Größte Geräteinstanz" },
	autoImportAll: { en: "Automatically read all conflict-free devices after discovery", de: "Nach der Gerätesuche alle konfliktfreien Geräte automatisch einlesen" },
	staleScansBeforeDelete: { en: "Successful scans before stale cleanup", de: "Erfolgreiche Suchläufe vor dem Entfernen veralteter Geräte" },
	dataFlow: { en: "Data flow", de: "Datenfluss" },
	pollingHelp: {
		en: "Only selected Present_Value points are polled or subscribed via COV.",
		de: "Nur ausgewählte Present_Value-Punkte werden gepollt oder per COV abonniert."
	},
	reading: { en: "Reading", de: "Lesen" },
	pollingEnabled: { en: "Enable polling", de: "Regelmäßige Abfrage aktivieren" },
	covEnabled: { en: "Use COV where supported", de: "COV verwenden, wenn unterstützt" },
	pollIntervalMs: { en: "Polling interval (ms)", de: "Abfrageintervall (ms)" },
	requestConcurrency: { en: "Global request concurrency", de: "Globale Anzahl paralleler Anfragen" },
	perDeviceConcurrency: { en: "Per-device request concurrency", de: "Parallele Anfragen je Gerät" },
	writing: { en: "Writing", de: "Schreiben" },
	writeWarning: {
		en: "Writing remains disabled by default. A point must also be a supported Present_Value and appear in the stable-ID allowlist.",
		de: "Schreiben bleibt standardmäßig deaktiviert. Ein Punkt muss zusätzlich ein unterstützter Present_Value sein und in der Freigabeliste der stabilen IDs stehen."
	},
	writeEnabled: { en: "Enable BACnet writing", de: "BACnet-Schreiben aktivieren" },
	writePriority: { en: "Write priority (1–16)", de: "Schreibpriorität (1–16)" },
	writeAllowlist: { en: "Writable stable point IDs", de: "Freigegebene stabile Punkt-IDs" },
	service: { en: "Service", de: "Service" },
	diagnosticsHelp: {
		en: "Load the current socket, discovery, import and inventory counters from the running instance.",
		de: "Aktuelle Socket-, Discovery-, Import- und Inventarzähler aus der laufenden Instanz laden."
	},
	loadDiagnostics: { en: "Load diagnostics", de: "Diagnose laden" },
	loadingDevices: { en: "Loading device catalog…", de: "Gerätekatalog wird geladen…" },
	deviceListUpdated: { en: "Device list updated.", de: "Geräteliste aktualisiert." },
	loadFailed: { en: "Could not load device list", de: "Geräteliste konnte nicht geladen werden" },
	unknownError: { en: "Unknown error", de: "Unbekannter Fehler" },
	working: { en: "Working:", de: "In Bearbeitung:" },
	operationFailed: { en: "Operation failed", de: "Vorgang fehlgeschlagen" },
	discoveryStarted: { en: "Discovery started…", de: "Gerätesuche gestartet…" },
	discoveryCompleted: { en: "Discovery completed.", de: "Gerätesuche abgeschlossen." },
	discoveryCancelled: { en: "Discovery cancelled.", de: "Gerätesuche abgebrochen." },
	readingDeviceData: { en: "Reading device inventory…", de: "Geräteinventar wird eingelesen…" },
	importCompleted: { en: "Device inventory completed.", de: "Geräteinventar vollständig eingelesen." },
	requestTimeout: { en: "The adapter did not answer in time.", de: "Der Adapter hat nicht rechtzeitig geantwortet." },
	adapterConnectionMissing: { en: "No connection to the running adapter instance.", de: "Keine Verbindung zur laufenden Adapterinstanz." },
	loading: { en: "Loading…", de: "Wird geladen…" }
};
