import "./globals.css";
import "./ask-aladdin.css";
import "./workspace.css";
import "./theme.css";
import "./fidelity.css";
import "./table-first.css";
import "./components/ask-aladdin/ask-workspace.css";
import "./components/launches/launches.css";
import "./wallet-connect.css";
import "./mobile-ux.css";
import { AppShell } from "@/app/components/layout/AppShell";
import { ThemeProvider } from "@/app/components/theme/ThemeProvider";
import { AuthProvider } from "@/app/contexts/AuthContext";
import { SolanaProvider } from "@/app/providers/SolanaProvider";
export const metadata = {
  title: "Aladdin Intelligence",
  description: "Behaviour-first trading intelligence terminal",
};
export const viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#07070a",
};
const themeBoot = `(()=>{try{const key="aladdin-theme",stored=localStorage.getItem(key),preference=stored==="dark"||stored==="light"||stored==="system"?stored:"system",resolved=preference==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):preference,root=document.documentElement;root.dataset.theme=preference;root.dataset.resolvedTheme=resolved;root.style.colorScheme=resolved}catch{}})()`;
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      data-theme="system"
      data-resolved-theme="dark"
      suppressHydrationWarning
    >
      <head><script dangerouslySetInnerHTML={{ __html: themeBoot }} />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <SolanaProvider>
              <AppShell>{children}</AppShell>
            </SolanaProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
