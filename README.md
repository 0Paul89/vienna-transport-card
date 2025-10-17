# Wiener Linien meets Home Assistant! 

### Dashboard Karte um Abfahrten und andere Infos anzuzeigen.

### WICHTIG: Benötigt die "wl_monitor" Komponente, um zu funktionieren!


## MAJOR UPDATE!

Verwendet nun die odg_realtime API der WL. Hierzu wird ein Sensor als custom component hinzugefügt.

Neu: Optionaler Filter nach Richtung und/oder Linie, falls für eine StopID mehr als eine verfügbar (edge case, normalerweise nicht nötig), respektiert theme variables


## 1. INSTALLATION wl_monitor:

In HACS UI: 3-Dots (oben rechts) -> Benutzerdefinierte Repositories -> paste https://github.com/0Paul89/wl_monitor -> Typ Integration -> hinzufügen

Dann in HACS nach "wl_monitor" suchen und installieren.


## 2. INSTALLATION vienna-transport-card:

HACS:

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=0Paul89&repository=vienna-transport-card" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store." /></a>

MANUELL:

- vienna-transport-card.js muss als Resource hinzugefügt werden (unter http://homeassistant.local:8123/config/lovelace/resources)
- danach HA neu starten



## 3. VERWENDUNG / LOVELACE-SETUP

[example_lovelace.yaml](https://github.com/0Paul89/vienna-transport-card/blob/main/example_lovelace.yaml) zeigt korrekte Verwendung. 

Sensoren vorher in configuration.yaml definieren:

1. StopId für Linie/Station/Richtung herausfinden: https://till.mabe.at/rbl/ 
2. siehe example_configuration.yaml  
3. Neu laden, danach sind entities mit der jeweiligen StopId als Suffix vorhanden
   

## BEISPIELBILDER

<img width="456" height="685" alt="WL_1" src="https://github.com/user-attachments/assets/5c86f18c-bab4-4190-bdf6-a22ce05367d0" />

<img width="457" height="535" alt="WL_2" src="https://github.com/user-attachments/assets/b35c4ee3-fd8a-4b6d-85b5-42f66adb1c71" />

