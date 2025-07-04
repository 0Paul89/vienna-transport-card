Wiener Linien meets Home Assistant! 



Dashboard Karte um Abfahrten anzuzeigen.




Installation 

HACS:

<a href="https://my.home-assistant.io/redirect/hacs_repository/?owner=0Paul89&repository=vienna-transport-card" target="_blank" rel="noreferrer noopener"><img src="https://my.home-assistant.io/badges/hacs_repository.svg" alt="Open your Home Assistant instance and open a repository inside the Home Assistant Community Store." /></a>



MANUELL:

- vienna-transport-card.js muss als Resource hinzugefügt werden (unter http://homeassistant.local:8123/config/lovelace/resources), danach HA neu starten.

- example_lovelace.yaml zeigt korrekte Verwendung. Die station_id muss der Request entnommen werden, welche die reguläre Wiener Linien Website für Station XY zum Server macht. 

  => Abfahrten Website öffnen, Networktools öffnen (F12), auf beliebige Station klicken und station_id aus URL der entsprechenden request entnehmen (station_id Format ist "vao:xxxxxxxxx") 

![Screenshot from 2025-03-29 18-35-51](https://github.com/user-attachments/assets/4a3e0555-461c-4cf7-b7cc-451335a165f7)
![Screenshot from 2025-03-29 18-36-04](https://github.com/user-attachments/assets/c4b19091-5455-439b-be69-cc862aa1c623)
