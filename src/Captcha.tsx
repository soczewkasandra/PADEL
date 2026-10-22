import { useEffect, useRef } from "react";
import { siteKey } from "./api";
type Turnstile = {
  render: (node: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let loading: Promise<void> | null = null;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!loading)
    loading = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => {
        loading = null;
        script.remove();
        reject(new Error("CAPTCHA"));
      };
      document.head.appendChild(script);
    });
  return loading;
}
export function Captcha({ onToken }: { onToken: (value: string) => void }) {
  const node = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true,
      id: string | undefined;
    if (siteKey)
      load()
        .then(() => {
          if (active && node.current)
            id = window.turnstile?.render(node.current, {
              sitekey: siteKey,
              action: "padel_booking",
              callback: onToken,
              "expired-callback": () => onToken(""),
              "error-callback": () => onToken(""),
            });
        })
        .catch(() => onToken(""));
    return () => {
      active = false;
      if (id) window.turnstile?.remove(id);
    };
  }, [onToken]);
  return (
    <div>
      <div ref={node} />
      <small>
        Weryfikacja antyspamowa Cloudflare. Jeśli się nie pojawi, sprawdź
        połączenie i ustawienia CAPTCHA.
      </small>
    </div>
  );
}
