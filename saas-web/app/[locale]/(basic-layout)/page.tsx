import HomeComponent from "@/components/home";
import PWAInstallPrompt from "@/components/pwa/PWAInstallPrompt";

export default function Home() {
  return (
    <>
      <HomeComponent />
      <PWAInstallPrompt />
    </>
  );
}
