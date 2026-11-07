# AUGI · Caderneta predial → Google Maps

Site estático (sem build) que converte as coordenadas X/Y das cadernetas prediais (Hayford-Gauss militar, Datum Lisboa, EPSG:20790) em latitude/longitude para o Google Maps. A conversão é feita no navegador.

## Publicar na Vercel (projeto separado do simulador)
1. Vercel → *Add New… → Project* → importar este repositório.
2. **Root Directory: `augi`** · Framework Preset: *Other* · sem Build Command nem Output Directory.
3. *Settings → Domains* → adicionar `augi.proptycs.com`.
4. No DNS de `proptycs.com`: registo `CNAME` · nome `augi` · valor `cname.vercel-dns.com` (ou o valor que a Vercel indicar).

Dependências incluídas em `vendor/`: proj4js (MIT) e Leaflet (BSD-2).
