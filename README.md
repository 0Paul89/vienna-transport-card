# Wiener Linien meets Home Assistant! 

### Dashboard Karte um Abfahrten und andere Infos anzuzeigen.


## MAJOR UPDATE!

Verwendet nun die odg_realtime API der WL. Hierzu wird ein Sensor als custom component hinzugefügt.
Neu: Zeigt Barrierefreiheit, Klimatisierung (bzw. foldingRamp) und Störungen an.




## 1. INSTALLATION 

HACS:

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=0Paul89&repository=vienna-transport-card" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store." /></a>

MANUELL:

- vienna-transport-card.js muss als Resource hinzugefügt werden (unter http://homeassistant.local:8123/config/lovelace/resources)
- /custom_components/wl_monitor hinzufügen
- danach HA neu starten



## 2. VERWENDUNG / LOVELACE-SETUP

[example_lovelace.yaml](https://github.com/0Paul89/vienna-transport-card/blob/main/example_lovelace.yaml) zeigt korrekte Verwendung. 

Sensoren vorher in configuration.yaml definieren:

1. StopId für Linie/Station/Richtung herausfinden: https://till.mabe.at/rbl/ 
2. siehe example_configuration.yaml  
3. Neu laden, danach sind entities mit der jeweiligen StopId als Suffix vorhanden
   

## 3. BEISPIELBILDER

NORMAL:

<img width="511" height="509" alt="normal" src="https://github.com/user-attachments/assets/f5694528-e2ce-41cc-9e9e-e2ee1345c919" />


MIT RICHTUNGSFILTER:

<img width="511" height="334" alt="richtungsfilter" src="https://github.com/user-attachments/assets/161d00e4-1f8d-47d4-8826-8b8f1a2682c1" />
