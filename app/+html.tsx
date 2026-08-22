import { ScrollViewStyleReset } from 'expo-router/html';

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, shrink-to-fit=no" />
        <meta name="theme-color" content="#F5F5F7" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var d=window.matchMedia('(prefers-color-scheme: dark)').matches;var c=d?'#0E0E0E':'#F5F5F7';var t=d?'#F2F2F2':'#1C1C1E';document.documentElement.style.colorScheme=d?'dark':'light';document.documentElement.style.backgroundColor=c;document.documentElement.classList.add(d?'gm-dark':'gm-light');if(document.body){document.body.style.backgroundColor=c;document.body.style.color=t;}var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',c);}catch(e){}})();`,
          }}
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: responsiveBackground }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const responsiveBackground = `
html, body, #root {
  height: 100%;
}
body {
  margin: 0;
  background-color: #F5F5F7;
  color: #1C1C1E;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
/* Telemóvel: o documento faz scroll — Safari/Chrome escondem a barra ao deslizar. */
html.gm-mobile-doc-scroll,
html.gm-mobile-doc-scroll body {
  height: auto !important;
  min-height: 100% !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  -webkit-overflow-scrolling: touch;
}
html.gm-mobile-doc-scroll #root {
  height: auto !important;
  min-height: 100dvh !important;
  overflow: visible !important;
}
html.gm-mobile-doc-scroll .gm-unlock-scroll {
  height: auto !important;
  max-height: none !important;
  overflow: visible !important;
}
/* Fundos claros típicos do SSR RN-web — forçar cinza no modo escuro do telemóvel. */
@media (prefers-color-scheme: dark) {
  html, body, #root {
    background-color: #0E0E0E !important;
    color: #F2F2F2 !important;
    color-scheme: dark;
  }
  meta[name="theme-color"] {
    content: #0E0E0E;
  }
  /* Sobrescreve fundos claros inline do SSR (RN-web) nos wrappers principais. */
  #root div[style*="rgba(245,245,247"],
  #root div[style*="rgb(245, 245, 247"],
  #root div[style*="rgba(255,255,255"],
  #root div[style*="rgb(255, 255, 255"],
  #root div[style*="rgba(245,251,250"],
  #root div[style*="rgba(234,247,244"],
  #root div[style*="rgba(210,239,234"],
  #root div[style*="rgba(184,228,222"] {
    background-color: #0E0E0E !important;
    background-image: none !important;
  }
}
html.gm-dark, html.gm-dark body, html.gm-dark #root {
  background-color: #0E0E0E !important;
  color: #F2F2F2 !important;
  color-scheme: dark;
}
html.gm-dark #root div[style*="rgba(245,245,247"],
html.gm-dark #root div[style*="rgb(245, 245, 247"],
html.gm-dark #root div[style*="rgba(255,255,255"],
html.gm-dark #root div[style*="rgb(255, 255, 255"],
html.gm-dark #root div[style*="rgba(245,251,250"],
html.gm-dark #root div[style*="rgba(234,247,244"],
html.gm-dark #root div[style*="rgba(210,239,234"],
html.gm-dark #root div[style*="rgba(184,228,222"] {
  background-color: #0E0E0E !important;
  background-image: none !important;
}
`;