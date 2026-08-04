import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { MapPin, Truck, X } from "lucide-react";

const REFRESH_INTERVAL_MS = 15000;
const MIN_RADIUS_MILES = 5;
const SINGLE_VEHICLE_ZOOM = 15;

// A simple van/vehicle icon rendered as SVG, used as the marker instead of
// the default Google Maps teardrop pin. Brand blue, white vehicle glyph.
const VEHICLE_ICON_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
  <circle cx="18" cy="18" r="16" fill="#3b82f6" stroke="#ffffff" stroke-width="2"/>
  <path fill="#ffffff" d="M11 15.5h1.2l1.1-3.3c.2-.6.8-1 1.4-1h6.6c.6 0 1.2.4 1.4 1l1.1 3.3H25c.6 0 1 .4 1 1v4.5c0 .4-.3.7-.7.7H24c0 1.1-.9 2-2 2s-2-.9-2-2h-4.6c0 1.1-.9 2-2 2s-2-.9-2-2H10.7c-.4 0-.7-.3-.7-.7V18c0-1.4 1-2.5 2-2.5zm3.6-3.1-.9 3.1h9.1l-1-3.1a.4.4 0 0 0-.4-.3h-6.4a.4.4 0 0 0-.4.3zM14 21.7a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm8 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
</svg>`;
const VEHICLE_ICON_URL = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(VEHICLE_ICON_SVG)}`;

// Rough conversion: 1 mile ≈ these many degrees of lat/lng at the given
// latitude (longitude degrees shrink as you move away from the equator).
function milesToLatDegrees(miles: number) {
  return miles / 69;
}
function milesToLngDegrees(miles: number, atLat: number) {
  return miles / (69 * Math.cos((atLat * Math.PI) / 180));
}

export default function LiveMap() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const lastFitKeyRef = useRef<string>("");

  const [mapsError, setMapsError] = useState<string | null>(null);
  const [mapsReady, setMapsReady] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<number | null>(null);

  const { data: locations, isLoading } = trpc.liveMap.getLocations.useQuery(undefined, {
    refetchInterval: REFRESH_INTERVAL_MS,
  });

  // Load the Maps script and create the map instance once.
  useEffect(() => {
    loadGoogleMaps()
      .then(() => {
        if (!mapContainerRef.current) return;
        mapRef.current = new google.maps.Map(mapContainerRef.current, {
          zoom: 12,
          center: { lat: 40.7128, lng: -74.006 }, // reasonable default; first live pin re-centers it below
          disableDefaultUI: false,
        });
        infoWindowRef.current = new google.maps.InfoWindow();
        setMapsReady(true);
      })
      .catch((err) => setMapsError(err.message));
  }, []);

  // Keep markers in sync with the latest polled locations, and handle both
  // the "show everyone, zoomed out" and "follow just this one" modes.
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !locations) return;

    const visibleLocations = selectedDriverId
      ? locations.filter(l => l.driverId === selectedDriverId)
      : locations;
    const visibleIds = new Set(visibleLocations.map(l => l.driverId));

    // Remove markers for drivers no longer visible (clocked out, or
    // filtered out by single-vehicle mode).
    for (const [driverId, marker] of markersRef.current.entries()) {
      if (!visibleIds.has(driverId)) {
        marker.setMap(null);
        markersRef.current.delete(driverId);
      }
    }

    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    for (const loc of visibleLocations) {
      const position = { lat: loc.latitude, lng: loc.longitude };
      bounds.extend(position);
      hasPoints = true;

      let marker = markersRef.current.get(loc.driverId);
      if (!marker) {
        marker = new google.maps.Marker({
          map: mapRef.current,
          position,
          icon: {
            url: VEHICLE_ICON_URL,
            scaledSize: new google.maps.Size(36, 36),
            anchor: new google.maps.Point(18, 18),
          },
        });
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

    if (!hasPoints) return;

    if (selectedDriverId) {
      // Single-vehicle mode: keep following it as new positions come in,
      // at a close-in zoom suited to watching one van.
      const target = visibleLocations[0];
      mapRef.current.panTo({ lat: target.latitude, lng: target.longitude });
      if (mapRef.current.getZoom() !== SINGLE_VEHICLE_ZOOM) {
        mapRef.current.setZoom(SINGLE_VEHICLE_ZOOM);
      }
    } else {
      // Multi-vehicle mode: only re-fit when the actual set of visible
      // vehicles changes, not on every 15s poll, so the view doesn't keep
      // yanking around under someone actively looking at it.
      const fitKey = visibleLocations.map(l => l.driverId).sort().join(",");
      if (fitKey !== lastFitKeyRef.current) {
        lastFitKeyRef.current = fitKey;

        // Guarantee at least a 5-mile radius is visible, even if all
        // vehicles happen to be clustered close together — extend the
        // bounds with points 5 miles out from the center in each direction.
        const center = bounds.getCenter();
        const latOffset = milesToLatDegrees(MIN_RADIUS_MILES);
        const lngOffset = milesToLngDegrees(MIN_RADIUS_MILES, center.lat());
        bounds.extend({ lat: center.lat() + latOffset, lng: center.lng() + lngOffset });
        bounds.extend({ lat: center.lat() - latOffset, lng: center.lng() - lngOffset });

        mapRef.current.fitBounds(bounds);
      }
    }
  }, [locations, mapsReady, selectedDriverId]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <MapPin className="h-6 w-6 text-primary" /> Live Map
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time location for drivers currently clocked in — updates automatically every 15 seconds.
          </p>
        </div>
        {selectedDriverId && (
          <Button variant="outline" size="sm" onClick={() => setSelectedDriverId(null)}>
            <X className="h-3.5 w-3.5 mr-1" /> Show All Vehicles
          </Button>
        )}
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
          {mapsReady && locations && locations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {selectedDriverId ? "Tracking" : `Currently On the Map (${locations.length})`}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {locations.map(loc => {
                  const isSelected = selectedDriverId === loc.driverId;
                  if (selectedDriverId && !isSelected) return null;
                  return (
                    <button
                      key={loc.driverId}
                      className={`w-full flex items-center justify-between text-sm py-2 px-2 -mx-2 rounded-md border-b last:border-0 hover:bg-muted/50 text-left ${isSelected ? "bg-primary/10" : ""}`}
                      onClick={() => setSelectedDriverId(isSelected ? null : loc.driverId)}
                    >
                      <div className="flex items-center gap-2">
                        <Truck className={`h-4 w-4 shrink-0 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                        <div>
                          <p className="font-medium">{loc.driverName}</p>
                          <p className="text-xs text-muted-foreground">
                            {loc.vanNumber ? `Van ${loc.vanNumber}` : "No van on file"}
                          </p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Updated {new Date(loc.recordedAt).toLocaleTimeString()}
                      </p>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
