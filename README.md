# Wiener Linien meets Home Assistant! 

### Dashboard Karte um Abfahrten anzuzeigen.



## 1. INSTALLATION 

HACS (empfohlen):

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=0Paul89&repository=vienna-transport-card" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store." /></a>

MANUELL:

- vienna-transport-card.js muss als Resource hinzugefügt werden (unter http://homeassistant.local:8123/config/lovelace/resources), danach HA neu starten.



## 2. VERWENDUNG / LOVELACE-SETUP

NEU: Optionaler Richtungsfilter im Dashboard! (siehe example_lovelace.yaml)

example_lovelace.yaml zeigt korrekte Verwendung. Die station_id muss der Request entnommen werden, welche die reguläre Wiener Linien Website für Station XY zum Server macht. 

  => Abfahrten Website öffnen (https://www.wienmobil.at/de/monitor/PT), Networktools öffnen (F12), auf beliebige Station klicken und station_id aus URL der entsprechenden request entnehmen (station_id Format ist "vao:xxxxxxxxx") 



## 3. BEISPIELBILDER

NORMAL:

<img width="511" height="509" alt="normal" src="https://github.com/user-attachments/assets/f5694528-e2ce-41cc-9e9e-e2ee1345c919" />


MIT RICHTUNGSFILTER:

<img width="511" height="334" alt="richtungsfilter" src="https://github.com/user-attachments/assets/161d00e4-1f8d-47d4-8826-8b8f1a2682c1" />
