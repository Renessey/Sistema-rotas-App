# Valhalla Offline Data for Maricá, Niterói, and São Gonçalo (Phase 4 & 5)

This directory contains the structure for the embedded offline routing engine (Valhalla).

## Structure
```
ValhallaData/
├── tiles/      # Extracted Valhalla routing tiles (.gph files)
├── config/     # valhalla.json engine configuration
└── metadata/   # Region metadata, bounding box, and version info
```

## How to build OSM tiles for Maricá + Niterói + São Gonçalo

1. **Download OSM PBF for Rio de Janeiro State** (or specifically the Greater Metropolitan area):
   ```bash
   wget https://download.geofabrik.de/south-america/brazil/rio-de-janeiro-latest.osm.pbf
   ```

2. **Extract/Crop the region** covering Maricá, Niterói, and São Gonçalo (approx bounds: W -43.3, S -23.1, E -42.7, N -22.6):
   ```bash
   osmium extract -b -43.3,-23.1,-42.7,-22.6 rio-de-janeiro-latest.osm.pbf -o marica-niteroi-sg.osm.pbf
   ```

3. **Configure Valhalla**:
   Generate a config file for the region:
   ```bash
   valhalla_build_config --mjx 4 --base-url "file://./tiles" > config/valhalla.json
   ```

4. **Build Valhalla tiles**:
   ```bash
   valhalla_build_tiles -c config/valhalla.json marica-niteroi-sg.osm.pbf
   ```

5. **Install on Android**:
   Copy the generated `tiles/` folder and `config/valhalla.json` into the device's app files directory:
   `/data/user/0/com.routes/files/valhalla/`

6. **Enable in Native Bridge**:
   Once the tiles and C++ library are linked, flip `isEngineLinked` to `true` in `ValhallaNativeModule.kt`.
