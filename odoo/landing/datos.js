// Datos reales de Odoo (3-nov-2026, solo lectura): productos publicados, con foto y con existencia
// en el almacén de Valencia. No hay precios ni existencia en la página: el precio se ve con cuenta de
// distribuidor y la disponibilidad la da la tienda en vivo.
window.SUPRICOM = {
    odoo: "https://supricom2.odoo.com",
    whatsapp: "584123326646",
    totales: { publicados: 3046, marcas: 84 },
    // `destacado`: el que sale en el anillo de la portada y en Destacados (uno por categoría).
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
    ],
    // La tienda todavía no tiene categorías propias: cada tarjeta lleva a una búsqueda.
    categorias: [
        { id: "impresion", nombre: "Impresoras", foto: 109582, buscar: "impresora" },
        { id: "consumibles", nombre: "Consumibles y papel", foto: 109144, buscar: "tinta" },
        { id: "computo", nombre: "Laptops y monitores", foto: 112057, buscar: "laptop" },
        { id: "perifericos", nombre: "Periféricos", foto: 108278, buscar: "mouse" },
        { id: "redes", nombre: "Redes y WiFi", foto: 108549, buscar: "router" },
        { id: "audio", nombre: "Audio", foto: 111966, buscar: "audifono" },
        { id: "seguridad", nombre: "Seguridad y hogar inteligente", foto: 108591, buscar: "camara" },
        { id: "energia", nombre: "Energía y UPS", foto: 111790, buscar: "ups" }
    ],
    banners: [
        { nombre: "Somos el aliado", img: "../website_supricom_tienda/static/src/img/banners/aliado.jpg", alt: "Somos el aliado que respalda tu tienda mes a mes", buscar: "" },
        { nombre: "Hikvision", img: "../website_supricom_tienda/static/src/img/banners/hikvision.jpg", alt: "Hikvision: promociones únicas durante todo el año", buscar: "hikvision" },
        { nombre: "Papel HP", img: "../website_supricom_tienda/static/src/img/banners/papel_hp.jpg", alt: "Líderes en distribución de papel HP en toda Venezuela", buscar: "papel" },
        { nombre: "Nexxt Home", img: "../website_supricom_tienda/static/src/img/banners/nexxt_home.jpg", alt: "Nexxt Home: la manera inteligente de simplificar tu vida", buscar: "nexxt" }
    ],
    // Klip Xtreme y Xtech quedan fuera hasta tener su logo.
    marcas: [
        { nombre: "HP", logo: "hp.svg", alto: 40 },
        { nombre: "Havit", logo: "havit.png", alto: 26, oscura: true },
        { nombre: "Canon", logo: "canon.svg", alto: 24 },
        { nombre: "TP-Link", logo: "tplink.svg", alto: 32 },
        { nombre: "Logitech", logo: "logitech.svg", alto: 28 },
        { nombre: "Epson", logo: "epson.svg", alto: 24 },
        { nombre: "Kingston", logo: "kingston.svg", alto: 28 },
        { nombre: "Nexxt", logo: "nexxt.svg", alto: 48 },
        { nombre: "Targus", logo: "targus.svg", alto: 20 },
        { nombre: "EZVIZ", logo: "ezviz.svg", alto: 30 }
    ]
};
