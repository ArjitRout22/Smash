import { BrandedLoader } from "@/components/ui/states";

// Root loading boundary — shown for ANY route segment without a closer one
// (public pages, login, cold PWA launch), so a shuttlecock-branded loader
// appears instead of a blank white screen while the server renders.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <BrandedLoader />
    </div>
  );
}
