let loadPromise: Promise<void> | null = null;

// Loads the Google Maps JS API script exactly once, no matter how many
// components ask for it. Returns a promise that resolves once `window.google`
// is actually available.
export function loadGoogleMaps(): Promise<void> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if ((window as any).google?.maps) {
      resolve();
      return;
    }

    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error("Google Maps API key isn't configured (VITE_GOOGLE_MAPS_API_KEY is missing)."));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps. Check your API key and network connection."));
    document.head.appendChild(script);
  });

  return loadPromise;
}
