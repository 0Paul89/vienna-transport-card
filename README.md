# Wiener Linien meets Home Assistant!

### Dashboard Karte um Abfahrten und andere Infos anzuzeigen.

### WICHTIG: Benötigt die "wl_monitor" Komponente, um zu funktionieren!

## MAJOR UPDATE!

Verwendet nun die odg_realtime API der WL. Hierzu wird ein Sensor als custom component hinzugefügt.

Neu: Optionaler Filter nach Richtung und/oder Linie, falls für eine StopID mehr als eine verfügbar (edge case, normalerweise nicht nötig), respektiert theme variables

## 1. INSTALLATION wl_monitor:

In HACS UI: 3-Dots (oben rechts) -> Benutzerdefinierte Repositories -> paste https://github.com/0Paul89/wl_monitor -> Typ: Integration -> hinzufügen

Dann in HACS nach "wl_monitor" suchen und installieren.

## 2. INSTALLATION vienna-transport-card:

HACS:

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=0Paul89&repository=vienna-transport-card" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store." /></a>

MANUELL:

- vienna-transport-card.js muss als Resource hinzugefügt werden (unter http://homeassistant.local:8123/config/lovelace/resources)
- danach HA neu starten

## 3. HALTESTELLEN EINPFLEGEN

1. StopId für Linie/Station/Richtung suchen: https://till.mabe.at/rbl/
2. StopId in die configuration.yaml geben (siehe [example_configuration.yaml](https://github.com/0Paul89/vienna-transport-card/blob/main/example_configuration.yaml))
3. Home Assistant neu laden

Nun sollten Enteties mit jeweiligen StopId als Suffix vorhanden sein.

## 4. VERWENDUNG / LOVELACE-SETUP

Falls man nicht mit Cards, Sections und Dashboards vertraut ist empfiehlt es sich im [Home Assistant Wiki](https://www.home-assistant.io/dashboards/sections/#adding-sections-and-cards-to-a-sections-view) einzulesen.

Cards oder Sections können nun mit custom yaml aus [example_lovelace.yaml](https://github.com/0Paul89/vienna-transport-card/blob/main/example_lovelace.yaml) eingerichtet werden.

### YAML Eigenschaften

- `max_departures` (Integer): Anzahl der Abfahrten, die pro konfigurierter Station angezeigt werden sollen.
  - Default: `3`
- `entities` (Array): Liste der zu überwachenden Stationen.

#### Entity-Objekt

Jedes Element im entities-Array hat folgende Eigenschaften:

- `entity` (String): Die Homeassistant Sensor-ID der Station
- `type` (String): Typ der Verkehrslinie
  - Mögliche Werte: `bim`, `bus`, `train`, `subway`.
  - Default: `bim`
- `direction` (String, optional): Filtert Abfahrten nach Richtung.
  - Beispiel: `Alaudagasse U`
  - Default: `null` (keine Filterung)
- `lines`: (Array<String>, optional): Filtert Abfahrten nach Liniennummern.
  - Beispiel: `["11", "N6", "U1", "6"]`.
  - Default: `null` (keine Filterung)

## BEISPIELBILDER

<img width="456" height="685" alt="WL_1" src="https://github.com/user-attachments/assets/5c86f18c-bab4-4190-bdf6-a22ce05367d0" />

<img width="457" height="535" alt="WL_2" src="https://github.com/user-attachments/assets/b35c4ee3-fd8a-4b6d-85b5-42f66adb1c71" />
