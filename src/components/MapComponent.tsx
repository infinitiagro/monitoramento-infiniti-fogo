import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DOMParser } from 'xmldom';
import { kml } from '@tmcw/togeojson';
import type { FeatureCollection, Point } from 'geojson';

interface MapComponentProps {
  center: [number, number];
  zoom: number;
}

// Define URLs for INPE KML data
const inpeUrls = [
  'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/kml/estados-48h/focos_frentes_MT.kml',
  'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/kml/estados-48h/focos_frentes_MS.kml',
  'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/kml/estados-48h/focos_frentes_BA.kml',
  'https://dataserver-coids.inpe.br/queimadas/queimadas/focos/kml/estados-48h/focos_frentes_MA.kml',
];

// Custom icon for fire points
const fireIcon = L.icon({
    iconUrl: 'https://img.icons8.com/plasticine/100/fire-element--v1.png', // Using a placeholder icon
    iconSize: [30, 30], // size of the icon
    iconAnchor: [15, 30], // point of the icon which will correspond to marker's location
    popupAnchor: [0, -30] // point from which the popup should open relative to the iconAnchor
});

// Refresh interval in milliseconds (10 minutes = 600 seconds * 1000 ms/s)
const REFRESH_INTERVAL = 600 * 1000;

const MapComponent: React.FC<MapComponentProps> = ({ center, zoom }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [fireDataLayers, setFireDataLayers] = useState<L.GeoJSON[]>([]);
  const farmLayerRef = useRef<L.GeoJSON | null>(null); // Ref to store farm layer
  const layersControlRef = useRef<L.Control.Layers | null>(null); // Ref for layers control

  // Function to fetch and process KML data (for fire points) via internal API proxy
  const fetchAndProcessFireKML = async (inpeUrl: string): Promise<L.GeoJSON | null> => {
    try {
      // Use the internal API route as a proxy
      const proxyApiUrl = `/api/inpe-kml?url=${encodeURIComponent(inpeUrl)}`;
      const response = await fetch(proxyApiUrl);

      if (!response.ok) {
        throw new Error(`Erro no proxy interno! status: ${response.status} para ${inpeUrl}`);
      }
      const kmlText = await response.text();
      return processKMLText(kmlText, inpeUrl);
    } catch (error) {
      console.error(`Erro ao buscar ou processar KML de ${inpeUrl} via proxy interno:`, error);
      return null;
    }
  };

  // Helper function to process KML text into GeoJSON layer
  const processKMLText = (kmlText: string, sourceUrl: string): L.GeoJSON | null => {
      try {
          const parser = new DOMParser();
          const kmlDoc = parser.parseFromString(kmlText, 'text/xml');
          // Check for parser errors
          const parsererrorNS = kmlDoc.getElementsByTagName("parsererror");
          if (parsererrorNS.length > 0) {
              console.error(`Erro de parsing KML de ${sourceUrl}:`, parsererrorNS[0].textContent);
              throw new Error('Erro de parsing KML');
          }

          const geojson = kml(kmlDoc) as FeatureCollection<Point>; // Assuming fire data are points

          // Filter out non-point features if necessary
          const pointFeatures = geojson.features.filter((feature: { geometry: { type: string; }; }) => feature.geometry?.type === 'Point');
          const pointFeatureCollection: FeatureCollection<Point> = {
              type: 'FeatureCollection',
              features: pointFeatures as any
          };

          if (pointFeatures.length === 0) {
              console.log(`Nenhum foco de incêndio (ponto) encontrado em ${sourceUrl}`);
              // Return an empty layer group instead of null to avoid issues in Promise.all
              return L.geoJSON();
          }

          const layer = L.geoJSON(pointFeatureCollection as any, {
            pointToLayer: (feature, latlng) => {
              return L.marker(latlng, { icon: fireIcon });
            },
            onEachFeature: (feature, layer) => {
              if (feature.properties) {
                let popupContent = `<b>${feature.properties.name || 'Foco de Incêndio'}</b>`;
                if (feature.properties.description) {
                    const desc = feature.properties.description;
                    // Extract specific fields from the description table
                    const dateTimeMatch = desc.match(/<td>Data Hora UTC<\/td><td>([^<]+)<\/td>/);
                    const satelliteMatch = desc.match(/<td>Satélite<\/td><td>([^<]+)<\/td>/);
                    const municipioMatch = desc.match(/<td>Município<\/td><td>([^<]+)<\/td>/);
                    const estadoMatch = desc.match(/<td>Estado<\/td><td>([^<]+)<\/td>/);

                    if (dateTimeMatch?.[1]) popupContent += `<br/>Data/Hora: ${dateTimeMatch[1]}`;
                    if (satelliteMatch?.[1]) popupContent += `<br/>Satélite: ${satelliteMatch[1]}`;
                    if (municipioMatch?.[1]) popupContent += `<br/>Município: ${municipioMatch[1]}`;
                    if (estadoMatch?.[1]) popupContent += `<br/>Estado: ${estadoMatch[1]}`;
                }
                layer.bindPopup(popupContent);
              }
            }
          });
          return layer;
      } catch (parseError) {
          console.error(`Erro ao processar KML de ${sourceUrl}:`, parseError);
          return null; // Return null on error
      }
  }

  // Function to update fire data
  const updateFireData = async () => {
    if (!mapRef.current) return;
    console.log('Atualizando dados de incêndio via proxy interno...');
    const newLayers = await Promise.all(inpeUrls.map(url => fetchAndProcessFireKML(url)));
    const validNewLayers = newLayers.filter(layer => layer !== null) as L.GeoJSON[];

    // Remove old layers from map and control
    fireDataLayers.forEach(layer => {
        mapRef.current?.removeLayer(layer);
        if (layersControlRef.current) {
            layersControlRef.current.removeLayer(layer);
        }
    });

    // Add new layers to map and control
    const fireLayerGroup = L.layerGroup(validNewLayers);
    mapRef.current?.addLayer(fireLayerGroup);
    if (layersControlRef.current) {
        layersControlRef.current.addOverlay(fireLayerGroup, "Focos de Incêndio (INPE)");
    }

    // Update state
    setFireDataLayers(validNewLayers); // Store individual layers for removal later
    console.log(`Dados de incêndio atualizados. ${validNewLayers.reduce((acc, layer) => acc + layer.getLayers().length, 0)} focos carregados.`);
  };

  // Function to load and process farm KML data
  const loadFarmKML = async (kmlUrl: string, layerName: string) => {
    try {
      console.log(`Carregando dados KML da fazenda de ${kmlUrl}...`);
      const response = await fetch(kmlUrl);
      
      if (!response.ok) {
        throw new Error(`Erro ao carregar KML da fazenda! Status: ${response.status}`);
      }
      
      const kmlText = await response.text();
      console.log("KML da fazenda carregado com sucesso, processando...");
      
      const parser = new DOMParser();
      const kmlDoc = parser.parseFromString(kmlText, "text/xml");
      
      // Check for parser errors
      const parsererrorNS = kmlDoc.getElementsByTagName("parsererror");
      if (parsererrorNS.length > 0) {
        console.error("Erro de parsing KML da fazenda:", parsererrorNS[0].textContent);
        throw new Error("Erro de parsing KML da fazenda");
      }
      
      const geojson = kml(kmlDoc);
      console.log("GeoJSON processado:", geojson);

      if (!geojson || !geojson.features || geojson.features.length === 0) {
        console.warn("Nenhuma feature encontrada no KML da fazenda");
        return;
      }

      const newFarmLayer = L.geoJSON(geojson as any, {
        style: function (feature) {
          let style: L.PathOptions = {
            color: "#fcb4d4", // Cor vermelha padrão para melhor visibilidade
            weight: 3, 
            opacity: 0.8, 
            fillOpacity: 0.2,
            fillColor: "#ffffff"
          };
          
          // Aplicar estilos baseados no styleUrl se disponível
          if (feature?.properties?.styleUrl) {
            if (feature.properties.styleUrl.includes("PolyStyle007")) { 
              style.color = "#ffffff"; 
              style.fillColor = "#fcb4d4";
              style.fillOpacity = 0.1; 
              style.weight = 2;
            } else if (feature.properties.styleUrl.includes("PolyStyle0012")) { 
              style.color = "#fcb4d4"; 
              style.fillColor = "#fcb4d4";
              style.fillOpacity = 0.1; 
              style.weight = 2;
            } else if (feature.properties.styleUrl.includes("PolyStyle00159")) {
              // Estilo do KML fornecido
              style.color = "#f0f0f0";
              style.fillColor = "#f0f0f0";
              style.fillOpacity = 0.07;
              style.weight = 3;
            }
          }
          return style;
        },
        onEachFeature: function (feature, layer) {
          let popupContent = feature.properties && feature.properties.name ? `<b>${feature.properties.name}</b>` : "<b>Perímetro da Fazenda</b>";
          layer.bindPopup(popupContent);
        }
      });

      if (mapRef.current) {
        newFarmLayer.addTo(mapRef.current);
        console.log(`Camada da fazenda ${layerName} adicionada ao mapa`);
        
        // Add farm layer to the control
        if (layersControlRef.current) {
          layersControlRef.current.addOverlay(newFarmLayer, layerName);
          console.log(`Camada da fazenda ${layerName} adicionada ao controle de camadas`);
        }
        
        // Fit map to farm bounds (only for the first KML loaded, or if no other farm KML is loaded)
        if (!farmLayerRef.current) { // Only fit bounds for the first farm KML loaded
          const bounds = newFarmLayer.getBounds();
          if (bounds.isValid()) {
            mapRef.current.fitBounds(bounds, { padding: [20, 20] });
            console.log("Mapa ajustado aos limites da fazenda");
          }
        }
        farmLayerRef.current = newFarmLayer; // Store the last loaded farm layer
      }
      
    } catch (error) {
      console.error(`Erro ao carregar KML da fazenda ${kmlUrl}:`, error);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    if (mapContainerRef.current && !mapRef.current) {
      // Initialize map
      mapRef.current = L.map(mapContainerRef.current, {
        center: center,
        zoom: zoom,
      });

      // --- Define Base Layers ---
      const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });

      const esriSatelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      });

      // Add default base layer (OSM)
      osmLayer.addTo(mapRef.current);

      // --- Define Overlay Layers ---
      const overlayMaps = {}; // Will be populated later

      // --- Add Layers Control ---
      const baseMaps = {
        "OpenStreetMap": osmLayer,
        "Satélite (ESRI)": esriSatelliteLayer
      };
      layersControlRef.current = L.control.layers(baseMaps, overlayMaps).addTo(mapRef.current);

      // Fix for marker icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      // Load Farm KML data
      const farmKMLs = [
        { url: 
          '/doc.kml', name: 'Propriedades Infiniti e Industrias INPASA' 
        },
        // Adicione mais KMLs aqui, por exemplo:
        // { url: '/outra_fazenda.kml', name: 'Outra Fazenda' },
      ];

      farmKMLs.forEach(farm => {
        loadFarmKML(farm.url, farm.name);
      });

      // Initial fetch of INPE Fire KML data
      updateFireData(); // This will now also add fire layers to the control

      // Set up interval for periodic updates
      intervalId = setInterval(updateFireData, REFRESH_INTERVAL);
    }

    // Cleanup function
    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      // Optional: Clean up map instance if component unmounts
      // if (mapRef.current) {
      //   mapRef.current.remove();
      //   mapRef.current = null;
      // }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center, zoom]); // Only re-run if center/zoom props change


  return <div ref={mapContainerRef} style={{ height: '100vh', width: '100%' }} />;
};

export default MapComponent;



