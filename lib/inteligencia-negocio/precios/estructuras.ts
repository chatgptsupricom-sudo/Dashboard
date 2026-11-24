/**
 * Taxonomía de la Inteligencia de Precios: las 47 categorías y la estructura
 * del nombre corto de cada una, copiadas de la hoja "Estructuras" del Excel
 * "Lista Ejemplo Ordenada" (nov-2026), y ejemplos ya clasificados de su hoja
 * "Catalogo" para la IA. Archivo generado: si cambia el Excel, se regenera.
 */

export interface EstructuraPrecio {
  categoria: string;
  estructura: string;
  ejemplo: string;
}

export const ESTRUCTURAS_PRECIOS: EstructuraPrecio[] = [
  { categoria: "LAPTOP", estructura: "Laptop + Procesador (familia) + RAM + Almacenamiento (+ GPU si es Gamer)", ejemplo: "Laptop Core i5 8GB 256GB SSD" },
  { categoria: "AIO", estructura: "AIO + Pulgadas + Procesador + RAM + Almacenamiento", ejemplo: "AIO 15\" Core i5 8GB 256GB SSD" },
  { categoria: "PC CORPORATIVA", estructura: "PC Corporativa + Procesador + RAM + Almacenamiento", ejemplo: "PC Corporativa Core i5 8GB 256GB SSD" },
  { categoria: "IMPRESORA", estructura: "Impresora + Función (Multifuncional / Solo Impresión) + Tipo (Tinta Continua, Láser Mono, Láser Color, Inyección, Sublimación, Matriz de Punto, Térmica de Recibos/Etiquetas, Carnets PVC)", ejemplo: "Impresora Multifuncional Tinta Continua" },
  { categoria: "MONITORES", estructura: "Monitor + Pulgadas + Resolución + Frecuencia + Panel", ejemplo: "Monitor 24\" FHD 100Hz IPS" },
  { categoria: "ALMACENAMIENTO", estructura: "Tipo (SSD / HDD / Pendrive / Memoria MicroSD / Carcasa para Disco) + Formato/Interfaz + Capacidad + Velocidad", ejemplo: "Pendrive USB 3.2 64GB" },
  { categoria: "ROUTERING", estructura: "Router (o Router Mesh) + Estándar WiFi + Velocidad + Puertos (+ Pack en sistemas Mesh)", ejemplo: "Router WiFi 6 AX3000 Gigabit" },
  { categoria: "UPS Y REGULADORES", estructura: "UPS [Tipo] + VA + W + Salidas / Estación de Energía + Potencia (W) + Capacidad (Wh) / Regulador de Voltaje + VA + W + Salidas / Protector de Voltaje + W + Salidas / Regleta o PDU + Salidas / Inversor + Potencia", ejemplo: "Regulador de Voltaje 1000VA 500W 8 Salidas" },
  { categoria: "CONSUMIBLES", estructura: "Tipo (Tóner / Cartucho de Tinta / Botella de Tinta / Cinta / Cabezal / Chip / Polvo) + Color + Rendimiento en impresiones", ejemplo: "Cinta Ribbon Color YMCKO (Carnets) Rendimiento de 200 impresiones" },
  { categoria: "PAPELERIA", estructura: "Papel + Tamaño + Presentación + Gramaje/Base / Etiquetas Térmicas en Rollo + Tamaño + Etiquetas por rollo", ejemplo: "Etiquetas Térmicas en Rollo 4\" x 2\" 2740 etiquetas/rollo" },
  { categoria: "SERVIDORES", estructura: "Servidor + Formato (Torre/Rack) + Procesador + RAM + Almacenamiento", ejemplo: "Servidor Torre Xeon 16GB Sin Disco" },
  { categoria: "MEMORIA RAM", estructura: "Memoria RAM + Tipo DDR + Formato (UDIMM/SODIMM/RDIMM) + Capacidad + Frecuencia", ejemplo: "Memoria RAM DDR4 UDIMM 8GB 3200MHz" },
  { categoria: "PROCESADORES", estructura: "Procesador + Familia + Modelo + Socket", ejemplo: "Procesador Ryzen 5 8600G AM5" },
  { categoria: "TARJETAS MADRE", estructura: "Tarjeta Madre + Chipset + Socket + Formato + Memoria (DDR)", ejemplo: "Tarjeta Madre B860 LGA1851 ATX DDR5" },
  { categoria: "TARJETAS DE VIDEO", estructura: "Tarjeta de Video + GPU + VRAM", ejemplo: "Tarjeta de Video RTX 3050 6GB" },
  { categoria: "CASES", estructura: "Case (Gaming) + Formato + Fuente (Con Fuente XW / Sin Fuente) + Ventiladores", ejemplo: "Case Micro-ATX Con Fuente 600W" },
  { categoria: "FUENTES DE PODER", estructura: "Fuente de Poder + Potencia + Certificación 80 Plus + Modularidad", ejemplo: "Fuente de Poder 650W 80 Plus Bronze" },
  { categoria: "REFRIGERACION", estructura: "Enfriador Líquido + Radiador (mm) + Iluminación / Disipador CPU + Tipo (Torre N Tubos) + TDP + Iluminación / Ventilador + Tamaño + Iluminación + Kit / Base Enfriadora para Laptop + Fans", ejemplo: "Enfriador Líquido 360mm ARGB" },
  { categoria: "REDES", estructura: "Switch + Puertos + Velocidad + PoE + Gestión / Access Point + Estándar WiFi + Velocidad + Montaje / Extensor de Señal + Estándar WiFi + Velocidad / Adaptador de Red + Interfaz + Estándar WiFi + Velocidad / Módulo SFP + Velocidad + Modo", ejemplo: "Adaptador de Red USB WiFi 6 AX1800" },
  { categoria: "CABLEADO Y RACKS", estructura: "Tipo (Patch Cord / Bobina Cable UTP / Patch Panel / Conectores) + Categoría + Longitud o Cantidad / Rack o Gabinete + Tipo + Altura (U)", ejemplo: "Jack Keystone RJ45 Cat6" },
  { categoria: "VIDEOVIGILANCIA", estructura: "Cámara IP + Tipo (Bullet/Domo/Turret/PTZ + Interior/Exterior) + Resolución + Conectividad / NVR + Canales + PoE", ejemplo: "Cámara IP Interior/Exterior 1080p WiFi" },
  { categoria: "BATERIAS Y PILAS", estructura: "Batería + Química + Voltaje + Capacidad (Ah) / Pila + Química + Tamaño + Presentación", ejemplo: "Batería Gel 12V 100Ah" },
  { categoria: "MOUSE", estructura: "Mouse (Gaming) + Conectividad + DPI / Mouse Pad (Gaming) + Tamaño", ejemplo: "Mouse Pad Gaming 80x60cm" },
  { categoria: "TECLADOS", estructura: "Teclado (Gaming) + Tipo (Mecánico/Membrana) + Conectividad", ejemplo: "Teclado Gaming Mecánico USB" },
  { categoria: "COMBOS TECLADO Y MOUSE", estructura: "Combo Teclado + Mouse (Gaming) + Conectividad", ejemplo: "Combo Teclado + Mouse Inalámbrico" },
  { categoria: "AUDIFONOS", estructura: "Audífono (Gaming) + Tipo (Headset / In-Ear / Earbuds TWS) + Conectividad + Micrófono", ejemplo: "Audífono Earbuds TWS Bluetooth con Micrófono" },
  { categoria: "CORNETAS", estructura: "Tipo (Corneta Portátil / Cornetas Multimedia 2.0-2.1 / Barra de Sonido / Profesional) + Potencia + Bluetooth", ejemplo: "Corneta Portátil 5W Bluetooth" },
  { categoria: "MICROFONOS", estructura: "Micrófono + Tipo + Conexión", ejemplo: "Micrófono Karaoke USB" },
  { categoria: "CAMARAS WEB", estructura: "Cámara Web + Resolución + Micrófono", ejemplo: "Cámara Web FHD con Micrófono" },
  { categoria: "GAMING", estructura: "Tipo (Gamepad / Volante / Consola) + Plataforma + Conectividad", ejemplo: "Gamepad Nintendo Switch Inalámbrico" },
  { categoria: "MOBILIARIO", estructura: "Silla + Tipo + Material / Mesa o Escritorio + Dimensiones + Ajuste de altura", ejemplo: "Silla Gaming Cuero Sintético" },
  { categoria: "SOPORTES Y BASES", estructura: "Soporte (para TV / Monitor / Laptop / Celular) + Tipo (Fijo/Inclinable/Articulado) + Rango de pulgadas + Carga", ejemplo: "Soporte para Monitor Doble Articulado Hasta 32\" 10kg" },
  { categoria: "BOLSOS Y ESTUCHES", estructura: "Tipo (Bolso / Morral / Funda / Estuche) + Uso + Pulgadas", ejemplo: "Morral para Laptop 15.6\"" },
  { categoria: "CABLES Y ADAPTADORES", estructura: "Cable + Conector A a Conector B + Longitud / Adaptador + Conector A a Conector B / Hub USB + Puertos + Versión USB", ejemplo: "Adaptador USB-C a HDMI" },
  { categoria: "CARGADORES Y POWER BANKS", estructura: "Cargador (de Pared / para Laptop / para Vehículo / Inalámbrico) + Potencia + Tecnología + Puerto / Power Bank + Capacidad (mAh) + Potencia", ejemplo: "Cargador de Pared 20W USB-C" },
  { categoria: "CELULARES Y TABLETS", estructura: "Celular + Modelo + Almacenamiento + RAM / Tablet + Pulgadas + Almacenamiento + RAM", ejemplo: "Celular iPhone 18 Pro Max 256GB" },
  { categoria: "TELEVISORES Y PANTALLAS", estructura: "Televisor o Pantalla Comercial + Pulgadas + Resolución + Smart TV + Panel", ejemplo: "Televisor 32\" HD Smart TV" },
  { categoria: "PROYECTORES", estructura: "Proyector + Lúmenes + Resolución / Pantalla de Proyección + Tipo + Pulgadas", ejemplo: "Proyector 4000 Lúmenes WXGA" },
  { categoria: "ESCANERES", estructura: "Escáner Documental + Tipo de alimentación (ADF / Cama Plana)", ejemplo: "Escáner Documental Cama Plana + ADF" },
  { categoria: "PUNTO DE VENTA", estructura: "Lector de Código de Barras + Tipo (de Mano/Fijo) + Lectura (1D/2D) + Conectividad / Balanza Digital + Capacidad / Gaveta de Dinero / Contadora de Billetes", ejemplo: "Lector de Código de Barras de Mano 2D USB" },
  { categoria: "WEARABLES", estructura: "Tipo (Smartwatch / Smart Band) + Segmento", ejemplo: "Smart Band" },
  { categoria: "HOGAR INTELIGENTE", estructura: "Tipo de dispositivo (Bombillo, Enchufe, Sensor, Cerradura, Asistente de Voz) + Formato + Color + Pack", ejemplo: "Asistente de Voz Echo Dot" },
  { categoria: "TELEFONIA Y RADIOS", estructura: "Tipo (Radio Portátil / Teléfono IP / Accesorio) + Banda + Pack", ejemplo: "Accesorio para Radio Portátil" },
  { categoria: "SOFTWARE", estructura: "Licencia + Producto + Edición + Vigencia/Formato", ejemplo: "Licencia Microsoft 365 Personal 1 Año" },
  { categoria: "ILUMINACION", estructura: "Tipo (Lámpara LED / Aro de Luz / Luces Decorativas) + Atributo principal", ejemplo: "Lámpara LED de Escritorio" },
  { categoria: "HOGAR Y OTROS", estructura: "Tipo de artículo + Atributo principal (capacidad/contenido)", ejemplo: "Aceite Esencial para Difusor 500ml" },
  { categoria: "ACCESORIOS VARIOS", estructura: "Tipo de accesorio + Atributo principal (categoría residual; revisar manualmente)", ejemplo: "Presentador Inalámbrico con Láser" },
];

export const CATEGORIAS_PRECIOS = ESTRUCTURAS_PRECIOS.map((e) => e.categoria);

/** [descripción del mayorista, marca, categoría, nombre corto, confianza, observaciones] */
export const EJEMPLOS_PRECIOS: [string, string, string, string, number, string][] = [
  ["DELL SERVIDOR POWER EDGE R470 XEON 6505P 12C/2.2G; 32GB/6400MTs/1X 480GB SSD","DELL","SERVIDORES","Servidor Rack Xeon 32GB 480GB SSD",1,""],
  ["LENOVO PORTATIL E14 GEN 7 ULTRA 7- 255H 16GB 512GB SSD M.2 14\" WIN 11 PRO NEGRO ESPAÑOL","LENOVO","LAPTOP","Laptop Core Ultra 7 16GB 512GB SSD",1,"Pantalla 14\"; Windows Pro"],
  ["Impresora EPSON sDFX-9000 de Matriz de Punto de Alto Rendimiento.","EPSON","IMPRESORA","Impresora Solo Impresión Matriz de Punto",1,""],
  ["EPSON SURECOLOR F570 PRINTER 24\"","EPSON","IMPRESORA","Impresora Solo Impresión Sublimación",0.9,"Función deducida (sin indicio de escáner)"],
  ["Battery Bank LiFePO4 16.07kWh (51.2V / 314Ah)","MARSRIVA","BATERIAS Y PILAS","Batería LiFePO4 51.2V 314Ah 16.07kWh",1,""],
  ["MR-SOL12K Solar & Battery Inverter 12kVA/12kW","MARSRIVA","UPS Y REGULADORES","Inversor 12000VA 12000W",1,"Solar/híbrido"],
  ["Ups CDP UPO33-HM10 Half rack Hot swap Modular UPS housing for up to 10 pcs UPO33PM","CDP","UPS Y REGULADORES","Gabinete Modular para UPS",0.85,"Accesorio; validar compatibilidad de modelo"],
  ["HP AIO PRO ONE 440 G9 I7-14700 16GB 512GB SSD 23.8\" FHD WIN11 PRO SPA","HPPCSERV","AIO","AIO 23.8\" Core i7 16GB 512GB SSD",1,"Windows Pro"],
  ["APPLE CELULAR IPHONE 18 PRO MAX 512GB ESIM SILVER","APPLE","CELULARES Y TABLETS","Celular iPhone 18 Pro Max 512GB",1,"RAM no publicada por el fabricante"],
  ["HP DT PRO DESK 4 SFF G1I U7 265 16GB 512GB SSD WIN11 PRO SPA","HPPCSERV","PC CORPORATIVA","PC Corporativa Core Ultra 7 16GB 512GB SSD",1,"Formato SFF/Slim; Windows Pro"],
  ["SAMSUNG PANTALLA COMERCIAL VMB-U PARA VIDEO WALL 46\" UHD HDMI 4K IP5x","SAMSUNG","TELEVISORES Y PANTALLAS","Pantalla Comercial (Señalización) 46\" 4K UHD",1,""],
  ["DELL MEMORIA DE SERVIDOR UPG 32GB DDR5 RDIMM 5600 MT/S NO APLICA PARA SERVIDORES DE 4800MT/S","DELL","MEMORIA RAM","Memoria RAM DDR5 RDIMM/ECC (Servidor) 32GB 5600MHz",1,""],
  ["OMADA 24-PORT GIGABIT STACKABLE L3 MANAGED SWITCH WITH 4 10G SLOTS","TP-LINK","REDES","Switch 24 Puertos Gigabit Administrable L3",1,"Omada"],
  ["44 x 10/100/1000B-T PoE Ports, 4 x 2.5GBase-T PoE Ports, 2 x 10GBASE-T Ports and 2 x 10G SFP+ Switch","D-LINK","REDES","Switch 44 Puertos Multi-Gig 2.5G PoE",0.8,"Falta: Gestión; Uplinks SFP+"],
  ["MONITOR MSI 49\" CURVO MPG 491CQP/ QD-OLED/ 5120x1440/ 144Hz/ VA/ 2xHDMI-DP-USB/ NEGRO","MSI","MONITORES","Monitor 49\" DQHD 144Hz QD-OLED",1,"Curvo"],
  ["MONITOR LG 40WP95C-W 40PULG 5120X2160 72HZ","LG","MONITORES","Monitor 40\" 5K2K 72Hz",0.8,"Falta: Panel"],
  ["EPSON PROYECTOR W55+ INALAMBRICO PORTATIL 3LCD 4000 LUMENS WXGA 1280*800","EPSON","PROYECTORES","Proyector 4000 Lúmenes WXGA",1,""],
  ["CARGADORES UNIVERSALES PARA MINI PC 65W","SIN MARCA IDENTIFICADA","CARGADORES Y POWER BANKS","Cargador para Laptop 65W",1,""],
  ["SISTEMA DE AUDIO PORTATIL PRO DG NEO-1 ARRAY DE 2 VIAS 460 W RMS / 920 W / PICO DE 1840 W","PRO DG","CORNETAS","Corneta Profesional Amplificada 460W",1,""],
  ["CONSOLA PLAYSTATION 5 SLIM STANDARD HW/ 1TB/ BLANCO","SONY","GAMING","Consola PlayStation 5 Slim Estándar (Lector) 1TB",1,""],
  ["Toner HP 827A Azul 32K MFP M880z","HP","CONSUMIBLES","Tóner Cian Rendimiento de 32000 impresiones",1,"Original; Ref. 827A"],
  ["Toner Hp 827A Amarillo MFP M880z","HP","CONSUMIBLES","Tóner Amarillo",0.8,"Falta: Rendimiento; Original; Ref. 827A"],
  ["DISCO DURO WESTERN DIGITAL PURPLE 10TB 3.5\" 7200RPM","WESTERN DIGITAL","ALMACENAMIENTO","HDD 3.5\" SATA 10TB 7200RPM",1,"Uso videovigilancia"],
  ["DELL DISCO DURO 960GB SATA READ INTENSIVE 6GBPS 512E 2.5IN 3.5IN HYBRID CARRIER (345-BGSY)","DELL","ALMACENAMIENTO","HDD 3.5\" SATA 960GB",0.8,"Falta: Velocidad (RPM)"],
  ["AMD PROCESADOR RYZEN 9-7950X AMD RADEON CORE 16 4,5 GHz SOCKET AM5","AMD","PROCESADORES","Procesador Ryzen 9 7950X AM5",1,""],
  ["TARJETA DE VIDEO GIGABYTE GEFORCE RTX 3060 WINDFORCE OC/ 12GB GDDR6/ 192BIT/ 550W/ 2XHDMI-2XDP/ NEGRO","GIGABYTE","TARJETAS DE VIDEO","Tarjeta de Video RTX 3060 12GB",1,"GDDR indicado; OC"],
  ["FUENTE DE PODER XPG 1300W GAMING CYBERCORE II ATX 3.1/ 80+PLATINUM/ 12V-2x6/ 100-240V/ NEGRO","XGP","FUENTES DE PODER","Fuente de Poder 1300W 80 Plus Platinum",1,"ATX 3.x"],
  ["TM ASROCK X870E TAICHI OCF/ ATX/ SOCKET AMD5/ 2xDDR5-8400/ 2xSATA/ 3xPCIe/ 5xM.2/ 22xUSB/ HDMI-2xUSB4/ WIFI 7","ASROCK","TARJETAS MADRE","Tarjeta Madre X870E AM5 ATX DDR5",1,"WiFi integrado; M.2"],
  ["ROUTER TP-LINK DECO BE25 WIFI 7-MESH BE5000 2.5GBPS DOBLE BANDA/ AI ROAMING/ 3 PACK","TP-LINK","ROUTERING","Router Mesh WiFi 7 BE5000 Multi-Gig 2.5G (3-Pack)",1,""],
  ["TARJETA PCI A EXPRESS 1 PUERTOS DB25 LPT 25PIN PARALELO","GENERICO","CABLES Y ADAPTADORES","Tarjeta de Expansión PCIe Paralelo",1,""],
  ["ZEBRA ROLLO DE ETIQUETAS 4000T 4X3\" (101.6X76.2MM)1\"(25.4MM)CORE, 930 12 X CAJA","ZEBRA","PAPELERIA","Etiquetas Térmicas en Rollo 4\" x 3\" 930 etiquetas/rollo",1,""],
  ["HP SCANER SCANJET PRO 3000 S4 CON ALIMENTADOR AUTOMATICO","HP","ESCANERES","Escáner Documental ADF Vertical",1,""],
  ["Mesa GAMING STRIG HSMTK-2 RGB para PC Ajustable 1500x600x1170cm","STRIG","MOBILIARIO","Mesa Gaming 150x60cm Altura Ajustable",1,"Iluminación LED"],
  ["VENTILADOR LIAN LI UNI FAN SL KIT 3 EN 1/ LCD 120x3/ ARGB/ 0.300-1900 RPM/ 12CM/ NEGRO (EMPAQUE RETAIL)","LIAN LI","REFRIGERACION","Ventilador 120mm ARGB Kit x3",1,""],
  ["BALANZA DIGITS-T ROMANA INDUSTRIAL DE PLATAFORMA 3T","OTRAS MARCAS","PUNTO DE VENTA","Balanza Digital 3000kg",1,""],
  ["NEXXT RACK DE PISO MARCO ABIERTO 45U 4 POSTES NEGRO NPO-4P42UB","NEXXT","CABLEADO Y RACKS","Rack Abierto de Piso 45U",1,""],
  ["VIGI NVR4032H NVR 32 CANALES","TP-LINK","VIDEOVIGILANCIA","NVR 32 Canales",1,""],
  ["LOGITECH AUDIFONOS G522 INALAMBRICO GAMING CON MICROFONO HQ RGB / LIGHTSPEED NEGRO","LOGITECH","AUDIFONOS","Audífono Gaming Headset Inalámbrico con Micrófono",1,"RGB"],
  ["AUDIFONO LOGITECH INALAMBRICO 2.4GHZ ASTRO A30 LIGHTSPEED PARA XBOX NEGRO 939-001999","LOGITECH","AUDIFONOS","Audífono Inalámbrico",0.8,"Falta: Tipo"],
  ["TECLADO LOGITECH MECANICO GAMING INALAMBRICO G715  BLUETOOTH INGLES BLANCO 920-010453","LOGITECH","TECLADOS","Teclado Gaming Mecánico Inalámbrico + Bluetooth",1,"Inglés"],
  ["Webcam LOGITECH Brio Ultra HD 4K USB/C","LOGITECH","CAMARAS WEB","Cámara Web 4K UHD",1,""],
  ["BASE DE MONITOR MSI MPG MT201DR V2/ DOBLE BRAZO CON RESORTE A GAS/ 17\"-35\"/ 20KG MAX/ RGB/ NEGRO","MSI","SOPORTES Y BASES","Soporte para Monitor Doble Articulado 17\"-35\" 20kg",1,""],
  ["CASE GIGABYTE GAMING C103G & GP-P650G ATX/ 3xUSB/ FAN ARGB/ LATERAL VIDRIO TEMPLADO/ NEGRO (INCLUYE FUENTE)","GIGABYTE","CASES","Case Gaming ATX Con Fuente",1,"Panel de vidrio; RGB"],
  ["CASE GAMIN ANTEC TORQUE MID TORRE C/VIDRIO TEMPLADO USB3.0 x 2, MIC/AUDIO (HD),  USB tipo C3.1","ANTEC","CASES","Case Sin Fuente",0.75,"Falta: Formato; Sin fuente asumido (la descripción no menciona fuente); Panel de vidrio"],
  ["MORRAL RAZER ROGUE BACKPACK 16\" V3/ RESISTENTE AL AGUA/ NEGRO","RAZER","BOLSOS Y ESTUCHES","Morral para Laptop 16\"",1,""],
  ["MOUSE ASUS GAMING P509 ROG KERIS/ 16000DPI/ 7 BOTONES/ USB-C/ NEGRO","ASUS","MOUSE","Mouse Gaming USB 16000DPI",1,""],
  ["Combo LOGITECH MK540 Mouse y Teclado Inalámbrico","LOGITECH","COMBOS TECLADO Y MOUSE","Combo Teclado + Mouse Inalámbrico",1,""],
  ["MICROFONO STREAMPLIFY MIC MINI 48/ RGB/ 3.5MM/ USB 2.0 TIPO C/ NEGRO","STREAMPLIFY","MICROFONOS","Micrófono Condensador USB",1,""],
];

/** Marcas del Excel de ejemplo: para reconocer la marca en descripciones de listas sin columna de marca. */
export const MARCAS_BASE: string[] = ["1HORA","3NSTAR","ACER","ADATA","ADDLINK","ADVANCE","AEROCOOL","AGILER","AKATSUKI","ALCATEL","ALLMAX","ALSEYE","AMAZON","AMD","ANTEC","AOC","AON","APC","APPLE","ARGOM","ARGOMTECH","ARKTEK","AROA","ARTECK","ASROCK","AST","ASTRA","ASTRON","ASUS","AUCE","AXXIS","AZZA","BADGY","BAOFENG","BARKAN","BASEUS","BEELINK","BIOSTAR","BOSE","BROTHER","CANON","CDP","CHALLENGER","CHECK POINT","CHECKPOINT","CHERRY","CHUWI","CISCO","COMPAQ","CONASTRON","COOLER MASTER","CORSAIR","CRUCIAL","CUDY","CYBERPOWER","D-LINK","DAEWOO","DAHUA","DATO","DECIBEL","DEEPCOOL","DELL","DELUX","DGK","DIAMONDTIGER","DYNATEK","E.O.C","EAGLE","EAGLE WARRIOR","EBL","ECOFLOW","ECS","EDISON","ENERGIZER","EPSON","EVERCOOL","EVGA","EVOLIS","EXPLORE","FINTIE","FLEXIFOCUS","FORZA","FUJIFILM","FUSION","GAMDIAS","GAMEMAX","GATEWAY","GEKO","GENIUS","GIGABYTE","GOOGLE","GOPRO","GP","GRANDSTREAM","HAOVISION","HAVIT","HIKSEMI","HIKVISION","HISENSE","HP","HPIMPRESIO","HPPCSERV","HUAWEI","HYTE","HYUNDAI","INIUX","INSIDE TECH","INSIGNIA","INTEL","IOCREST","JBL","JEMIP","KINGSTON","KLIP XTREME","KN95","LAMBO","LEADERTECH","LENOVO","LEXAR","LG","LIAN LI","LINKSYS","LIVA","LOGITECH","MACH","MACHINIST","MAGNAPRINT","MARKVISION","MARSRIVA","MARVO","MAXELL","MERCUSYS","METALNET","MICROSOFT","MOONKI","MSI","MUSHKIN","MYO","NANO","NETIS","NEXXT","NINJA","NINTENDO","NORTH BAYOU","NOVA","NOVIX","OMEGA","OONTZ","PATRIOT","PICKENS","PLAYSTATION","POLY","PRIMUS","PRO DG","QNAP","QNET","QUASAR","RAZER","REALME","REALTEK","REDRAGON","RIPPA","RJ45","ROCKSOUL","ROKU","RUIJIE REYEE","SAMSUNG","SANDISK","SAT","SEAGATE","SHURE","SKHYNIX","SLIIM","SMARTBITT","SOMOSTEL","SONY","SPIDERTEC","STARLINK","STREAMPLIFY","STRIG","STRIKE ME","SUPERTALENT","SWITCHS","T3U NANO","TAPO","TAPO IP","TARGET","TARGUS","TCL","THERMALTAKE","THONET & VANDER","TISHRIC","TLC","TOMAX","TONAL","TOSHIBA","TP-LINK","TRUST","U PRODUCTS","U-PROD","UBIQUITI","UNNO TEKNO","VIEWSONIC","WESTERN DIGITAL","WESTINGHOUSE","XEROX","XGP","XIAOMI","XPG","XTECH","ZEBRA"];
