import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin } from "lucide-react";

const REFRESH_INTERVAL_MS = 15000;

export default function LiveMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const { data: locations, isLoading } = trpc.liveMap.getLocations.useQuery(undefined, {
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  // Load the Maps script and create the map instance once.
  useEffect(() => {
    loadGoogleMaps()
      .then(() => {
        if (!mapContainerRef.current) return;
        mapRef.current = new google.maps.Map(mapContainerRef.current, {
          zoom: 11,
          center: { lat: 40.7128, lng: -74.006 }, // reasonable default; first live pin re-centers it below
          disableDefaultUI: false,
        });
        infoWindowRef.current = new google.maps.InfoWindow();
        setMapsReady(true);
      })
      .catch((err) => setMapsError(err.message));
  }, []);

  // Keep markers in sync with the latest polled locations.
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !locations) return;

    const currentIds = new Set(locations.map(l => l.driverId));

    // Remove markers for drivers no longer live (clocked out).
    for (const [driverId, marker] of markersRef.current.entries()) {
      if (!currentIds.has(driverId)) {
        marker.setMap(null);
        markersRef.current.delete(driverId);
      }
    }

    let boundsHasPoints = false;
    const bounds = new google.maps.LatLngBounds();

    for (const loc of locations) {
      const position = { lat: loc.latitude, lng: loc.longitude };
      bounds.extend(position);
      boundsHasPoints = true;

      let marker = markersRef.current.get(loc.driverId);
      if (!marker) {
        marker = new google.maps.Marker({ map: mapRef.current, position });
        marker.addListener("click", () => {
          if (!infoWindowRef.current) return;
          infoWindowRef.current.setContent(
            `<div style="color:#111; font-size:13px;">
              <strong>${loc.driverName}</strong><br/>
              ${loc.vanNumber ? `Van ${loc.vanNumber}<br/>` : ""}
              Updated ${new Date(loc.recordedAt).toLocaleTimeString()}
            </div>`
          );
          infoWindowRef.current.open(mapRef.current!, marker);
        });
        markersRef.current.set(loc.driverId, marker);
      } else {
        marker.setPosition(position);
      }
    }

    // Only auto-fit bounds the first time we get real points, so the map
    // doesn't keep yanking around under someone actively looking at it.
    if (boundsHasPoints && markersRef.current.size === locations.length) {
      mapRef.current.fitBounds(bounds);
    }
  }, [locations, mapsReady]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MapPin className="h-6 w-6 text-primary" /> Live Map
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Real-time location for drivers currently clocked in — updates automatically every 15 seconds.
        </p>
      </div>

      {mapsError ? (
        <Card>
          <CardContent className="p-8 text-center">
            <p className="text-sm text-destructive">{mapsError}</p>
            <p className="text-xs text-muted-foreground mt-2">
              Set VITE_GOOGLE_MAPS_API_KEY in your environment and make sure the Maps JavaScript API is enabled for that key.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="relative w-full h-[500px] rounded-lg border overflow-hidden">
            <div ref={mapContainerRef} className="w-full h-full" />
            {(isLoading || !mapsReady) && (
              <Skeleton className="absolute inset-0 rounded-none" />
            )}
          </div>
          {mapsReady && (!locations || locations.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-4">
              No drivers currently clocked in. The map will populate automatically once someone clocks in from the mobile app.
            </p>
          )}
        </>
      )}
    </div>
  );
}
