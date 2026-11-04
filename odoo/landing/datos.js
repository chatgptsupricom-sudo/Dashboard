// Datos reales de Odoo (4-nov-2026, solo lectura). Cada sede muestra lo que tiene en existencia en su
// almacén principal (Valencia CENT1 de la compañía 9, Caracas PRIN1 de la 10, Panamá CENT1 de la 7),
// publicado y con foto. No hay precios ni existencia en la página: el precio se ve con cuenta de
// distribuidor y la disponibilidad la da la tienda en vivo.
//
// Hoy Odoo tiene una sola tienda (website 1, Valencia, almacén 9) y el catálogo publicado es el mismo para
// las tres sedes: por eso `tienda` es la misma en las tres. Esa tienda calcula la existencia con Valencia,
// así que solo Valencia tiene `tiendaPropia`: en las otras, los productos no enlazan a la ficha de Odoo
// (diría «Agotado») sino que se agregan a la lista de cotización. Cuando Caracas y Panamá tengan su sitio
// en Odoo, se cambia su `tienda` aquí y se les pone `tiendaPropia: true`.
window.SUPRICOM = {
    // Una tarjeta por categoría; cada sede muestra solo las que tienen productos suyos.
    categorias: [
        { id: "impresion", nombre: "Impresoras", buscar: "impresora" },
        { id: "consumibles", nombre: "Consumibles y papel", buscar: "tinta" },
        { id: "computo", nombre: "Laptops y monitores", buscar: "laptop" },
        { id: "perifericos", nombre: "Periféricos", buscar: "mouse" },
        { id: "redes", nombre: "Redes y WiFi", buscar: "router" },
        { id: "audio", nombre: "Audio", buscar: "audifono" },
        { id: "seguridad", nombre: "Seguridad y hogar inteligente", buscar: "camara" },
        { id: "energia", nombre: "Energía y UPS", buscar: "ups" }
    ],
    banners: {
        aliado: { nombre: "Somos el aliado", img: "../website_supricom_tienda/static/src/img/banners/aliado.jpg", alt: "Somos el aliado que respalda tu tienda mes a mes", buscar: "" },
        hikvision: { nombre: "Hikvision", img: "../website_supricom_tienda/static/src/img/banners/hikvision.jpg", alt: "Hikvision: promociones únicas durante todo el año", buscar: "hikvision" },
        papel: { nombre: "Papel HP", img: "../website_supricom_tienda/static/src/img/banners/papel_hp.jpg", alt: "Líderes en distribución de papel HP en toda Venezuela", buscar: "papel" },
        nexxt: { nombre: "Nexxt Home", img: "../website_supricom_tienda/static/src/img/banners/nexxt_home.jpg", alt: "Nexxt Home: la manera inteligente de simplificar tu vida", buscar: "nexxt" }
    },
    // Klip Xtreme y Xtech quedan fuera hasta tener su logo.
    logos: {
        HP: { logo: "hp.svg", alto: 40 },
        Havit: { logo: "havit.png", alto: 26, oscura: true },
        Canon: { logo: "canon.svg", alto: 24 },
        "TP-Link": { logo: "tplink.svg", alto: 32 },
        Logitech: { logo: "logitech.svg", alto: 28 },
        Epson: { logo: "epson.svg", alto: 24 },
        Kingston: { logo: "kingston.svg", alto: 28 },
        Nexxt: { logo: "nexxt.svg", alto: 48 },
        Targus: { logo: "targus.svg", alto: 20 },
        EZVIZ: { logo: "ezviz.svg", alto: 30, oscura: true }
    },
    // `dominio`: el de la sede; ahí la página abre ya en esa sede. En supricom.com se elige en el menú.
    // `coords`: la sede, para proponer la más cercana con la ubicación del visitante.
    // `whatsapp`: sin número, las cotizaciones de esa sede van por correo a `correo`.
    // `marcas`: cuántas marcas tiene en existencia la sede. `destacado`: el del anillo, uno por categoría.
    sedes: {
        valencia: {
            nombre: "Valencia", pais: "Venezuela", dominio: "supricom.com.ve", tienda: "https://supricom2.odoo.com", tiendaPropia: true,
            coords: [10.170, -68.004], whatsapp: "584123326646", telefono: "+58 412 3326646",
            correo: "webstore.valencia@supricom.com.ve", documento: "RIF", marcas: 41,
            banners: ["aliado", "hikvision", "papel", "nexxt"],
            logos: ["HP", "Havit", "Canon", "TP-Link", "Logitech", "Epson", "Kingston", "Nexxt", "Targus", "EZVIZ"],
            productos: [
                { id: 109582, codigo: "5807C004AB", marca: "Canon", nombre: "Multifuncional PIXMA G4170, tanque de tinta, WiFi", cat: "impresion", destacado: true },
                { id: 108165, codigo: "C11CJ80201", marca: "Epson", nombre: "Impresora de sublimación SureColor F170, A4", cat: "impresion" },
                { id: 108031, codigo: "5805C004AA", marca: "Canon", nombre: "Multifuncional PIXMA G3170, WiFi", cat: "impresion" },
                { id: 108162, codigo: "S015631", marca: "Epson", nombre: "Cinta para LX-350", cat: "consumibles" },
                { id: 109144, codigo: "M0H54ALP", marca: "HP", nombre: "Tinta GT52 cian original", cat: "consumibles", destacado: true },
                { id: 109145, codigo: "M0H55ALP", marca: "HP", nombre: "Tinta GT52 magenta original", cat: "consumibles" },
                { id: 112057, codigo: "F1605VA-WS96", marca: "ASUS", nombre: "Vivobook 16, Core i9-13900H, 16 GB, SSD 1 TB", cat: "computo", destacado: true },
                { id: 112083, codigo: "NHDACAL003", marca: "Acer", nombre: "Nitro Lite 16, Core i5, 16 GB, RTX 3050", cat: "computo" },
                { id: 111679, codigo: "NXJTSAL002", marca: "Acer", nombre: "Laptop 15\" Full HD, Core 7 150U, 16 GB, 512 GB", cat: "computo" },
                { id: 107993, codigo: "UM.QV0AA.301", marca: "Acer", nombre: "Monitor VG240Y 23,8\" Full HD", cat: "computo" },
                { id: 108312, codigo: "DS-D5032F3-1V0S", marca: "Hikvision", nombre: "Monitor 32\" Full HD", cat: "computo" },
                { id: 109410, codigo: "G2790VX", marca: "AOC", nombre: "Monitor G2790VX 27\" IPS 144 Hz", cat: "computo" },
                { id: 108278, codigo: "KB260GCM", marca: "Havit", nombre: "Combo teclado y mouse inalámbrico KB260GCM", cat: "perifericos", destacado: true },
                { id: 108276, codigo: "KB488L-SP", marca: "Havit", nombre: "Teclado gamer KB488L con reposamuñecas RGB", cat: "perifericos" },
                { id: 108267, codigo: "HV-MS989GT-BS", marca: "Havit", nombre: "Mouse inalámbrico MS989GT", cat: "perifericos" },
                { id: 109001, codigo: "DTX-64GB", marca: "Kingston", nombre: "Pendrive DataTraveler Exodia M 64 GB USB 3.2", cat: "perifericos" },
                { id: 109882, codigo: "DTXS/128GB", marca: "Kingston", nombre: "Pendrive DataTraveler Exodia S 128 GB", cat: "perifericos" },
                { id: 108308, codigo: "DS-3WR15X", marca: "Hikvision", nombre: "Router WiFi 6 AX1500 Gigabit", cat: "redes" },
                { id: 108549, codigo: "MX20EC3", marca: "Linksys", nombre: "Mesh Atlas Velop WiFi 6 AX2900, 3 unidades", cat: "redes", destacado: true },
                { id: 108595, codigo: "AW160NXT01", marca: "Nexxt", nombre: "Placa de pared keystone de 1 puerto", cat: "redes" },
                { id: 111966, codigo: "H635BT-GY", marca: "Havit", nombre: "Audífonos Bluetooth Space NC01H gris", cat: "audio", destacado: true },
                { id: 109664, codigo: "H2590BT-PRO-BL", marca: "Havit", nombre: "Audífonos inalámbricos H2590BT Pro", cat: "audio" },
                { id: 108918, codigo: "AEH102TT", marca: "Targus", nombre: "Audífonos estéreo USB", cat: "audio" },
                { id: 108591, codigo: "MM107NXT23", marca: "Nexxt", nombre: "Cámara WiFi PTZ para exterior 2K+", cat: "seguridad", destacado: true },
                { id: 108574, codigo: "MM106NXT46", marca: "Nexxt", nombre: "Cámara WiFi para interior 2K QHD", cat: "seguridad" },
                { id: 109157, codigo: "MM105NXT19", marca: "Nexxt", nombre: "Bombillos LED inteligentes WiFi, 4 unidades", cat: "seguridad" },
                { id: 108196, codigo: "PS-001W", marca: "Forza", nombre: "Regleta de 6 tomas con disyuntor", cat: "energia" },
                { id: 111790, codigo: "PAC180PUSGYBL010", marca: "Bluetti", nombre: "Estación de energía portátil AC180, 1.800 W", cat: "energia", destacado: true },
                { id: 112015, codigo: "PB5219", marca: "Havit", nombre: "Power bank magnético 3 en 1 PB5219", cat: "energia" }
            ]
        },
        caracas: {
            nombre: "Caracas", pais: "Venezuela", dominio: "caracas.supricom.com.ve", tienda: "https://supricom2.odoo.com",
            coords: [10.490, -66.830], whatsapp: "", telefono: "",
            correo: "webstore.ccs@supricom.com.ve", documento: "RIF", marcas: 42,
            // Sin papel HP en existencia en Caracas: va sin ese banner.
            banners: ["aliado", "hikvision", "nexxt"],
            logos: ["HP", "Havit", "Canon", "TP-Link", "Logitech", "Epson", "Kingston", "Nexxt", "Targus"],
            productos: [
                { id: 109582, codigo: "5807C004AB", marca: "Canon", nombre: "Multifuncional PIXMA G4170, tanque de tinta, WiFi", cat: "impresion", destacado: true },
                { id: 108165, codigo: "C11CJ80201", marca: "Epson", nombre: "Impresora de sublimación SureColor F170, A4", cat: "impresion" },
                { id: 108031, codigo: "5805C004AA", marca: "Canon", nombre: "Multifuncional PIXMA G3170, WiFi", cat: "impresion" },
                { id: 108162, codigo: "S015631", marca: "Epson", nombre: "Cinta para LX-350", cat: "consumibles" },
                { id: 109144, codigo: "M0H54ALP", marca: "HP", nombre: "Tinta GT52 cian original", cat: "consumibles", destacado: true },
                { id: 109145, codigo: "M0H55ALP", marca: "HP", nombre: "Tinta GT52 magenta original", cat: "consumibles" },
                { id: 112057, codigo: "F1605VA-WS96", marca: "ASUS", nombre: "Vivobook 16, Core i9-13900H, 16 GB, SSD 1 TB", cat: "computo", destacado: true },
                { id: 112083, codigo: "NHDACAL003", marca: "Acer", nombre: "Nitro Lite 16, Core i5, 16 GB, RTX 3050", cat: "computo" },
                { id: 111679, codigo: "NXJTSAL002", marca: "Acer", nombre: "Laptop 15\" Full HD, Core 7 150U, 16 GB, 512 GB", cat: "computo" },
                { id: 109410, codigo: "G2790VX", marca: "AOC", nombre: "Monitor G2790VX 27\" IPS 144 Hz", cat: "computo" },
                { id: 108278, codigo: "KB260GCM", marca: "Havit", nombre: "Combo teclado y mouse inalámbrico KB260GCM", cat: "perifericos", destacado: true },
                { id: 108276, codigo: "KB488L-SP", marca: "Havit", nombre: "Teclado gamer KB488L con reposamuñecas RGB", cat: "perifericos" },
                { id: 109001, codigo: "DTX-64GB", marca: "Kingston", nombre: "Pendrive DataTraveler Exodia M 64 GB USB 3.2", cat: "perifericos" },
                { id: 109882, codigo: "DTXS/128GB", marca: "Kingston", nombre: "Pendrive DataTraveler Exodia S 128 GB", cat: "perifericos" },
                { id: 108304, codigo: "DS-3WAP622G-SI", marca: "Hikvision", nombre: "Punto de acceso WiFi 6 de 1.800 Mbps", cat: "redes", destacado: true },
                { id: 108302, codigo: "DS-3WAP522-SI", marca: "Hikvision", nombre: "Punto de acceso WiFi 5", cat: "redes" },
                { id: 111966, codigo: "H635BT-GY", marca: "Havit", nombre: "Audífonos Bluetooth Space NC01H gris", cat: "audio", destacado: true },
                { id: 109664, codigo: "H2590BT-PRO-BL", marca: "Havit", nombre: "Audífonos inalámbricos H2590BT Pro", cat: "audio" },
                { id: 108918, codigo: "AEH102TT", marca: "Targus", nombre: "Audífonos estéreo USB", cat: "audio" },
                { id: 108742, codigo: "TAPO-C310", marca: "TP-Link", nombre: "Cámara de seguridad para exterior Tapo C310, 3 MP", cat: "seguridad", destacado: true },
                { id: 109092, codigo: "IPC20-US", marca: "Havit", nombre: "Cámara IP WiFi para interior", cat: "seguridad" },
                { id: 111790, codigo: "PAC180PUSGYBL010", marca: "Bluetti", nombre: "Estación de energía portátil AC180, 1.800 W", cat: "energia", destacado: true },
                { id: 112015, codigo: "PB5219", marca: "Havit", nombre: "Power bank magnético 3 en 1 PB5219", cat: "energia" }
            ]
        },
        panama: {
            nombre: "Panamá", pais: "Panamá", dominio: "supricom.com.pa", tienda: "https://supricom2.odoo.com",
            coords: [8.990, -79.505], whatsapp: "", telefono: "+507 399-4554",
            correo: "webstore@supricom.com.pa", documento: "RUC", marcas: 26,
            banners: ["aliado"],
            logos: ["HP", "Canon", "TP-Link", "Logitech", "Epson", "Kingston", "EZVIZ"],
            productos: [
                { id: 111594, codigo: "5807C004AB-EX", marca: "Canon", nombre: "Multifuncional PIXMA G4170, tanque de tinta, WiFi", cat: "impresion", destacado: true },
                { id: 108050, codigo: "6670C004AA", marca: "Canon", nombre: "Multifuncional PIXMA TS3610", cat: "impresion" },
                { id: 108031, codigo: "5805C004AA", marca: "Canon", nombre: "Multifuncional PIXMA G3170, WiFi", cat: "impresion" },
                { id: 108024, codigo: "8274B001AA", marca: "Canon", nombre: "Cartucho PG-145 XL negro", cat: "consumibles", destacado: true },
                { id: 108415, codigo: "3YM79AL", marca: "HP", nombre: "Cartucho 667 negro", cat: "consumibles" },
                { id: 108044, codigo: "0667C001AA", marca: "Canon", nombre: "Botella de tinta GI-190 negro", cat: "consumibles" },
                { id: 109866, codigo: "PAPHP", marca: "HP", nombre: "Papel bond carta HP Office", cat: "consumibles" },
                { id: 110927, codigo: "920-002716", marca: "Logitech", nombre: "Combo teclado y mouse MK200, español", cat: "perifericos", destacado: true },
                { id: 109991, codigo: "910-004286", marca: "Logitech", nombre: "Mouse inalámbrico M280 rojo", cat: "perifericos" },
                { id: 110420, codigo: "UH6120C", marca: "TP-Link", nombre: "Hub USB-C 6 en 1 UH6120C, HDMI y RJ45", cat: "perifericos" },
                { id: 109885, codigo: "DTXS/64GB", marca: "Kingston", nombre: "Pendrive DataTraveler Exodia S 64 GB", cat: "perifericos" },
                { id: 110628, codigo: "DTXM/128GB", marca: "Kingston", nombre: "Pendrive DataTraveler Exodia M 128 GB", cat: "perifericos" },
                { id: 109879, codigo: "SDCS3-64GB", marca: "Kingston", nombre: "MicroSD Canvas Select Plus 64 GB", cat: "perifericos" },
                { id: 110913, codigo: "TL-WA850RE", marca: "TP-Link", nombre: "Extensor de WiFi N300 TL-WA850RE", cat: "redes", destacado: true },
                { id: 111712, codigo: "981-001596", marca: "Logitech", nombre: "Audífonos Zone Wireless 2 con cancelación de ruido", cat: "audio", destacado: true },
                { id: 111722, codigo: "981-001530", marca: "Logitech", nombre: "Audífonos gamer inalámbricos G325, blanco", cat: "audio" },
                { id: 110610, codigo: "CS-H6C-R105-1L3WF", marca: "EZVIZ", nombre: "Cámara WiFi H6C Pro 2K, visión 360°", cat: "seguridad", destacado: true },
                { id: 110607, codigo: "CS-H1C-R101-1G2WR", marca: "EZVIZ", nombre: "Cámara WiFi H1C 1080p con base magnética", cat: "seguridad" },
                { id: 111328, codigo: "CS-H9C-R105-8H33WFL", marca: "EZVIZ", nombre: "Cámara WiFi H9C de doble lente 2K para exterior", cat: "seguridad" },
                { id: 108672, codigo: "SBNB1800", marca: "Smartbitt", nombre: "UPS Smart de 1.800 VA, 6 salidas", cat: "energia", destacado: true },
                { id: 108670, codigo: "SMA-SBNB1000DR", marca: "Smartbitt", nombre: "UPS de 1.000 VA, 6 salidas", cat: "energia" }
            ]
        }
    }
};
