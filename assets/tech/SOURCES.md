# Technology marks — provenance

The logos in this folder appear in the "التقنيات الذكية التي ندعمها" strip on the
home page (`#integrations` in `views/home.ejs`).

Every file was downloaded from Wikimedia Commons and is recorded there as
**public domain** — these are `PD-textlogo` marks, below the threshold of
originality for copyright. Public domain covers copyright only. **The marks are
still trademarks of their owners**, and several are certification marks: showing
one can be read as a claim that ATEX is a certified member of that programme.

| File | Commons file | Rights holder | Certification mark? |
|---|---|---|---|
| `bacnet.svg` | BACnet Logo.svg | ASHRAE | yes — BACnet Testing Laboratories |
| `bluetooth.svg` | Bluetooth logo (2016).svg | Bluetooth SIG, Inc. | yes — Bluetooth SIG membership |
| `knx.svg` | KNX logo.svg | KNX Association cvba | yes — KNX Partner / certified product |
| `lorawan.svg` | LoRaWAN Logo.svg | LoRa Alliance | yes — LoRa Alliance membership |
| `modbus.svg` | Logo of Modbus-IDA.svg | Modbus Organization | no |
| `mqtt.svg` | Mqtt-hor.svg | OASIS | no — open standard |
| `power-bi.svg` | New Power BI Logo.svg | Microsoft | no |
| `thread.svg` | Thread Group wordmark.svg | Thread Group | yes — Thread Group membership |
| `whatsapp.svg` | WhatsApp Logo green.svg | WhatsApp LLC | no |
| `wifi.svg` | WiFi Logo.svg | Wi-Fi Alliance | yes — Wi-Fi CERTIFIED |
| `z-wave.svg` | Z-Wave logo.svg | Silicon Labs (was Sigma Designs) | yes — Z-Wave certification |
| `zigbee.svg` | Zigbee logo.svg | Connectivity Standards Alliance | yes — CSA membership |

**Confirmed by Okasha, 2026-08-09:** ATEX holds all seven of the certification
and membership programmes marked above — Wi-Fi CERTIFIED, Zigbee (CSA), Thread
Group, Z-Wave, KNX, BACnet (BTL) and LoRaWAN — so all twelve marks stay. He was
asked specifically because displaying one of these reads as a claim of
certified membership.

If that ever changes, removing a file is enough: `integrationLogo()` in
`views/home.ejs` falls back to the technology's name as text when no mark is
matched, so nothing breaks and the chip simply reads as before.

## Marks supplied by Okasha, 2026-08-09

Six further marks were handed over directly as PNGs (`C:\Users\m2kak\Downloads\tech`)
rather than pulled from Wikimedia, so **their source and licence are not
recorded here** — unlike every file above, whose Commons provenance is stated.
If this site is ever handed to a client, these six need their permission
confirmed.

They were downscaled to a 3× of the 26px the strip renders them at
(227 KB → 32 KB in total); the originals live in that Downloads folder.

| File | Chip label | Programme |
|---|---|---|
| `matter.png` | Matter 1.5 | Connectivity Standards Alliance certification |
| `dali-2.png` | DALI-2 | DiiA certification |
| `onvif.png` | ONVIF | ONVIF membership / conformance |
| `poe-ieee.png` | PoE IEEE 802.3bt | IEEE standard mark |
| `coap.png` | CoAP 1.0 | protocol mark |
| `nb-iot.png` | NB-IoT | technology mark |

The same caution as above applies: several of these read as a claim of
certification or membership.

Technologies still without a mark — OCPP, WPA3, TLS, SIP, RTSP, OSDP, LTE-M —
and the categories that are not brands at all — REST API, Webhooks, ERP, CRM,
GIS, SMS, Email — stay as text by design.
