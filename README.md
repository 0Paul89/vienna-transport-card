Wiener Linien meets Home Assistant! 



Dashboard Karte um Abfahrten anzuzeigen.

- Das Javascript file muss als Resource hinzugefügt werden (unter http://homeassistant.local:8123/config/lovelace/resources), danach HA neu starten.

- example_config.yaml zeigt korrekte Verwendung. Die station_id muss der Request entnommen werden, welche die reguläre Wiener Linien Website für Station XY zum Server macht. 

  => Abfahrten Website öffnen, Networktools öffnen (F12), auf beliebige Station klicken und station_id aus URL der entsprechenden request entnehmen (station_id Format ist "vao:xxxxxxxxx") 

![Screenshot from 2025-03-29 15-58-36](https://github.com/user-attachments/assets/496211c0-2e72-42c7-a974-e655d2c06ff8)
![Screenshot from 2025-03-29 15-58-53](https://github.com/user-attachments/assets/ff3711a6-7266-4db5-95c7-5b085953cf36)
