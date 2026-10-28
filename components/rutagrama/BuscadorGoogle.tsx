"use client";

import { cargarGoogle } from "@/lib/rutagrama/google";
import type { Punto } from "@/lib/rutagrama/tipos";
import { useEffect, useRef } from "react";

/**
 * Buscador de direcciones de Google (PlaceAutocompleteElement, Places API
 * (New)), limitado a Venezuela y Panamá y cargado hacia `cerca`. Al elegir
 * una dirección devuelve su punto y su dirección escrita.
 */
export function BuscadorGoogle({
  cerca,
  onElegir,
  onFalla,
}: {
  cerca: Punto;
  onElegir: (punto: Punto, direccion: string) => void;
  onFalla?: () => void;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const elegir = useRef(onElegir);
  elegir.current = onElegir;

  useEffect(() => {
    let vivo = true;
    let el: any = null;
    cargarGoogle()
      .then(async (maps) => {
        const { PlaceAutocompleteElement } = await maps.importLibrary("places");
        if (!vivo || !caja.current) return;
        el = new PlaceAutocompleteElement();
        el.includedRegionCodes = ["ve", "pa"];
        el.locationBias = { center: { lat: cerca[0], lng: cerca[1] }, radius: 30000 };
        el.style.width = "100%";
        el.style.colorScheme = "light";
        el.addEventListener("gmp-select", async ({ placePrediction }: any) => {
          const place = placePrediction.toPlace();
          await place.fetchFields({ fields: ["location", "formattedAddress"] });
          if (!place.location) return;
          const p: Punto = [Math.round(place.location.lat() * 1e6) / 1e6, Math.round(place.location.lng() * 1e6) / 1e6];
          elegir.current(p, place.formattedAddress ?? "");
        });
        el.addEventListener("gmp-error", () => onFalla?.());
        caja.current.appendChild(el);
      })
      .catch(() => vivo && onFalla?.());
    return () => {
      vivo = false;
      el?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={caja} className="w-full" aria-label="Buscar dirección" />;
}
