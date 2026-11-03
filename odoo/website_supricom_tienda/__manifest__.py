{
    "name": "SUPRICOM - Tienda web",
    "summary": "Estilo de la tienda SUPRICOM: banners 3D, cinta de marcas, categorías y tarjetas de producto",
    "description": """
Rediseño de la tienda web de SUPRICOM (propuesta A, nov-2026).

No es un tema (no hay que cambiar de tema en el sitio): es un módulo que se instala
encima del tema que ya está y del módulo supricom_web ("Solo cotización").

- Estilos del encabezado, la tienda, las tarjetas de producto y la ficha.
- Tres bloques nuevos para el editor del sitio (categoría "SUPRICOM"):
  Banners 3D, Cinta de marcas y Categorías.
- "Disponible" / "Agotado" en cada tarjeta de la tienda, sin mostrar cantidades.
""",
    "version": "17.0.1.0.0",
    "category": "Website/Website",
    "author": "SUPRICOM",
    "license": "LGPL-3",
    "depends": ["website_sale", "website_sale_stock"],
    "data": [
        "views/snippets.xml",
        "views/templates.xml",
    ],
    "assets": {
        "web.assets_frontend": [
            "website_supricom_tienda/static/src/scss/tienda.scss",
            "website_supricom_tienda/static/src/js/tienda.js",
        ],
    },
    "installable": True,
    "application": False,
}
