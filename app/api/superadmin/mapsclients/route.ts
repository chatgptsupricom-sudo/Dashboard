// // // // import { callOdooRPC } from "@/lib/odoo";
// // // // import { NextResponse } from "next/server";

// // // // export async function GET(request: Request) {
// // // //   try {
// // // //     const { searchParams } = new URL(request.url);
// // // //     const countryCode = searchParams.get("country") || "VE"; // VE, PA o US

// // // //     // Consultamos clientes del país seleccionado
// // // //     const clients = await callOdooRPC<any[]>("res.partner", "search_read", [
// // // //       [
// // // //         ["is_company", "=", true],
// // // //         ["state_id", "!=", false],
// // // //         ["country_id.code", "=", countryCode],
// // // //       ],
// // // //       ["name", "state_id", "city", "vat", "total_invoiced"],
// // // //     ]);

// // // //     const stateStats: Record<string, any> = {};

// // // //     clients.forEach((client) => {
// // // //       // Normalización estricta de nombres de estados para Match con GeoJSON
// // // //       const stateName = client.state_id[1]
// // // //         .split("(")[0]
// // // //         .trim()
// // // //         .toUpperCase()
// // // //         .normalize("NFD")
// // // //         .replace(/[\u0300-\u036f]/g, "");

// // // //       if (!stateStats[stateName]) {
// // // //         stateStats[stateName] = {
// // // //           count: 0,
// // // //           revenue: 0,
// // // //           clients: [],
// // // //           original_name: client.state_id[1], // Guardamos el nombre original para el UI
// // // //         };
// // // //       }

// // // //       stateStats[stateName].count += 1;
// // // //       stateStats[stateName].revenue += client.total_invoiced || 0;
// // // //       stateStats[stateName].clients.push({
// // // //         name: client.name,
// // // //         city: client.city || "N/A",
// // // //         rif: client.vat || "N/A",
// // // //         value: client.total_invoiced || 0,
// // // //       });
// // // //     });

// // // //     return NextResponse.json({
// // // //       summary: Object.entries(stateStats).map(([state, data]) => ({
// // // //         state: data.original_name,
// // // //         state_key: state, // Usado para el match del mapa
// // // //         count: data.count,
// // // //         revenue: data.revenue,
// // // //         clients: data.clients,
// // // //       })),
// // // //       total_clients: clients.length,
// // // //       currency: countryCode === "VE" ? "USD" : "USD", // Ajustar si Odoo usa PAB o similar
// // // //     });
// // // //   } catch (error: any) {
// // // //     return NextResponse.json({ error: error.message }, { status: 500 });
// // // //   }
// // // // }
// // // import { callOdooRPC } from "@/lib/odoo";
// // // import { NextResponse } from "next/server";

// // // export async function GET(request: Request) {
// // //   try {
// // //     const { searchParams } = new URL(request.url);
// // //     const countryCode = searchParams.get("country") || "VE";
// // //     const vendorId = searchParams.get("vendor_id");
// // //     const startDate = searchParams.get("startDate");
// // //     const endDate = searchParams.get("endDate");

// // //     // 1. OBTENER VENDEDORES ACTIVOS DIRECTAMENTE DE ODOO (Para asegurar que el Select no salga vacío)
// // //     // Buscamos usuarios que pertenezcan al equipo de ventas o tengan ventas asignadas
// // //     const sellers = await callOdooRPC<any[]>("res.users", "search_read", [
// // //       [["active", "=", true]],
// // //       ["id", "name"],
// // //     ]);

// // //     const hasDateFilter = startDate && endDate;
// // //     const stateStats: Record<string, any> = {};
// // //     let totalClientsCount = 0;

// // //     if (hasDateFilter) {
// // //       // 2. ENFOQUE POR FECHAS: Buscamos movimientos directamente en facturas asentadas
// // //       const invoiceDomain: any[] = [
// // //         ["state", "=", "posted"],
// // //         ["move_type", "=", "out_invoice"],
// // //         ["invoice_date", ">=", startDate],
// // //         ["invoice_date", "<=", endDate],
// // //         ["partner_id.country_id.code", "=", countryCode],
// // //       ];

// // //       if (vendorId && vendorId !== "all") {
// // //         invoiceDomain.push(["user_id", "=", parseInt(vendorId)]);
// // //       }

// // //       const invoices = await callOdooRPC<any[]>("account.move", "search_read", [
// // //         invoiceDomain,
// // //         ["partner_id", "amount_total_signed", "user_id"],
// // //       ]);

// // //       // Extraemos los IDs únicos de partners que tienen facturas en este rango
// // //       const partnerIds = Array.from(
// // //         new Set(invoices.map((inv) => inv.partner_id[0])),
// // //       );

// // //       if (partnerIds.length > 0) {
// // //         // Buscamos la info de ubicación de estos partners específicos
// // //         const clientsInfo = await callOdooRPC<any[]>(
// // //           "res.partner",
// // //           "search_read",
// // //           [
// // //             [
// // //               ["id", "in", partnerIds],
// // //               ["state_id", "!=", false],
// // //             ],
// // //             ["name", "state_id", "city", "vat"],
// // //           ],
// // //         );

// // //         totalClientsCount = clientsInfo.length;

// // //         // Mapeamos los datos geográficos de los clientes
// // //         const clientsMap: Record<number, any> = {};
// // //         clientsInfo.forEach((c) => {
// // //           clientsMap[c.id] = c;
// // //         });

// // //         // Agrupamos montos reales mapeando factura -> cliente -> estado
// // //         invoices.forEach((inv) => {
// // //           const pId = inv.partner_id[0];
// // //           const client = clientsMap[pId];
// // //           if (!client) return; // Si no tiene estado configurado, saltamos

// // //           const amount = inv.amount_total_signed || 0;
// // //           const stateName = client.state_id[1]
// // //             .split("(")[0]
// // //             .trim()
// // //             .toUpperCase()
// // //             .normalize("NFD")
// // //             .replace(/[\u0300-\u036f]/g, "");

// // //           if (!stateStats[stateName]) {
// // //             stateStats[stateName] = {
// // //               count: 0,
// // //               revenue: 0,
// // //               clientsMap: {},
// // //               original_name: client.state_id[1],
// // //             };
// // //           }

// // //           // Si el cliente no ha sido contado en este estado durante el periodo, sumamos 1 al conteo
// // //           if (!stateStats[stateName].clientsMap[pId]) {
// // //             stateStats[stateName].clientsMap[pId] = {
// // //               name: client.name,
// // //               city: client.city || "N/A",
// // //               rif: client.vat || "N/A",
// // //               value: 0,
// // //             };
// // //             stateStats[stateName].count += 1;
// // //           }

// // //           stateStats[stateName].revenue += amount;
// // //           stateStats[stateName].clientsMap[pId].value += amount;
// // //         });

// // //         // Convertimos el mapa interno de clientes a un array para el formato final
// // //         Object.keys(stateStats).forEach((stateKey) => {
// // //           stateStats[stateKey].clients = Object.values(
// // //             stateStats[stateKey].clientsMap,
// // //           );
// // //           delete stateStats[stateKey].clientsMap;
// // //         });
// // //       }
// // //     } else {
// // //       // 3. ENFOQUE HISTÓRICO TOTAL: Usamos la lectura tradicional de res.partner
// // //       const partnerDomain: any[] = [
// // //         ["is_company", "=", true],
// // //         ["state_id", "!=", false],
// // //         ["country_id.code", "=", countryCode],
// // //       ];

// // //       if (vendorId && vendorId !== "all") {
// // //         partnerDomain.push(["user_id", "=", parseInt(vendorId)]);
// // //       }

// // //       const clients = await callOdooRPC<any[]>("res.partner", "search_read", [
// // //         partnerDomain,
// // //         ["name", "state_id", "city", "vat", "total_invoiced"],
// // //       ]);

// // //       totalClientsCount = clients.length;

// // //       clients.forEach((client) => {
// // //         const stateName = client.state_id[1]
// // //           .split("(")[0]
// // //           .trim()
// // //           .toUpperCase()
// // //           .normalize("NFD")
// // //           .replace(/[\u0300-\u036f]/g, "");

// // //         if (!stateStats[stateName]) {
// // //           stateStats[stateName] = {
// // //             count: 0,
// // //             revenue: 0,
// // //             clients: [],
// // //             original_name: client.state_id[1],
// // //           };
// // //         }

// // //         const value = client.total_invoiced || 0;
// // //         stateStats[stateName].count += 1;
// // //         stateStats[stateName].revenue += value;
// // //         stateStats[stateName].clients.push({
// // //           name: client.name,
// // //           city: client.city || "N/A",
// // //           rif: client.vat || "N/A",
// // //           value: value,
// // //         });
// // //       });
// // //     }

// // //     // Estructuramos la respuesta limpia para el frontend
// // //     const summary = Object.entries(stateStats).map(([state, data]) => ({
// // //       state: data.original_name,
// // //       state_key: state,
// // //       count: data.count,
// // //       revenue: data.revenue,
// // //       clients: (data.clients || []).sort((a: any, b: any) => b.value - a.value),
// // //     }));

// // //     return NextResponse.json({
// // //       summary,
// // //       total_clients: totalClientsCount,
// // //       sellers: sellers.map((s) => ({ id: s.id, name: s.name })), // Sincroniza el dropdown de vendedores
// // //       currency: "USD",
// // //     });
// // //   } catch (error: any) {
// // //     return NextResponse.json({ error: error.message }, { status: 500 });
// // //   }
// // // }
// // import { callOdooRPC } from "@/lib/odoo";
// // import { NextResponse } from "next/server";

// // export async function GET(request: Request) {
// //   try {
// //     const { searchParams } = new URL(request.url);
// //     const countryCode = searchParams.get("country") || "VE";
// //     const vendorId = searchParams.get("vendor_id");
// //     const startDate = searchParams.get("startDate");
// //     const endDate = searchParams.get("endDate");

// //     // 1. OBTENER VENDEDORES ASOCIADOS A FACTURAS (Blindado con "|| []")
// //     const invoiceGroupData =
// //       (await callOdooRPC<any[]>("account.move", "read_group", [
// //         [
// //           ["state", "=", "posted"],
// //           ["move_type", "=", "out_invoice"],
// //           ["user_id", "!=", false],
// //         ],
// //         ["user_id"],
// //         ["user_id"],
// //       ])) || []; // Si Odoo devuelve undefined, evitamos que rompa usando un array vacío

// //     const sellers = invoiceGroupData
// //       .filter((group) => group && group.user_id)
// //       .map((group) => ({
// //         id: group.user_id[0],
// //         name: group.user_id[1],
// //       }))
// //       .sort((a, b) => a.name.localeCompare(b.name));

// //     const hasDateFilter = startDate && endDate;
// //     const stateStats: Record<string, any> = {};
// //     let totalClientsCount = 0;

// //     // 2. BUSCAR COMPAÑÍAS DEL PAÍS SELECCIONADO
// //     const countryPartners =
// //       (await callOdooRPC<any[]>("res.partner", "search", [
// //         [
// //           ["is_company", "=", true],
// //           ["country_id.code", "=", countryCode],
// //         ],
// //       ])) || [];

// //     if (!countryPartners.length) {
// //       return NextResponse.json({
// //         summary: [],
// //         total_clients: 0,
// //         sellers,
// //         currency: "USD",
// //       });
// //     }

// //     if (hasDateFilter) {
// //       // 3. ENFOQUE POR FECHAS: CONSULTA DOBLE
// //       const moveDomain: any[] = [
// //         ["state", "=", "posted"],
// //         ["move_type", "=", "out_invoice"],
// //         ["invoice_date", ">=", startDate],
// //         ["invoice_date", "<=", endDate],
// //         ["partner_id", "in", countryPartners],
// //       ];

// //       if (vendorId && vendorId !== "all") {
// //         moveDomain.push(["user_id", "=", parseInt(vendorId)]);
// //       }

// //       const moves =
// //         (await callOdooRPC<any[]>("account.move", "search_read", [
// //           moveDomain,
// //           ["id", "user_id"],
// //         ])) || [];

// //       if (moves.length > 0) {
// //         const moveIds = moves.map((m) => m.id);

// //         const moveSellerMap: Record<number, string> = {};
// //         moves.forEach((m) => {
// //           moveSellerMap[m.id] = m.user_id ? m.user_id[1] : "N/A";
// //         });

// //         const invoiceLines =
// //           (await callOdooRPC<any[]>("account.move.line", "search_read", [
// //             [
// //               ["move_id", "in", moveIds],
// //               ["display_type", "=", "product"],
// //             ],
// //             [
// //               "partner_id",
// //               "price_subtotal",
// //               "product_id",
// //               "quantity",
// //               "move_id",
// //             ],
// //           ])) || [];

// //         const partnerIds = Array.from(
// //           new Set(invoiceLines.map((line) => line.partner_id[0])),
// //         );

// //         if (partnerIds.length > 0) {
// //           const clientsInfo =
// //             (await callOdooRPC<any[]>("res.partner", "search_read", [
// //               [
// //                 ["id", "in", partnerIds],
// //                 ["state_id", "!=", false],
// //               ],
// //               ["name", "state_id", "city", "vat"],
// //             ])) || [];

// //           totalClientsCount = clientsInfo.length;
// //           const clientsMap: Record<number, any> = {};
// //           clientsInfo.forEach((c) => {
// //             clientsMap[c.id] = c;
// //           });

// //           invoiceLines.forEach((line) => {
// //             const pId = line.partner_id[0];
// //             const client = clientsMap[pId];
// //             if (!client) return;

// //             const mId = line.move_id[0];
// //             const amount = line.price_subtotal || 0;

// //             const stateName = client.state_id[1]
// //               .split("(")[0]
// //               .trim()
// //               .toUpperCase()
// //               .normalize("NFD")
// //               .replace(/[\u0300-\u036f]/g, "");

// //             if (!stateStats[stateName]) {
// //               stateStats[stateName] = {
// //                 count: 0,
// //                 revenue: 0,
// //                 clientsMap: {},
// //                 original_name: client.state_id[1],
// //               };
// //             }

// //             if (!stateStats[stateName].clientsMap[pId]) {
// //               stateStats[stateName].clientsMap[pId] = {
// //                 name: client.name,
// //                 city: client.city || "N/A",
// //                 rif: client.vat || "N/A",
// //                 seller_name: moveSellerMap[mId] || "N/A",
// //                 value: 0,
// //                 productsMap: {},
// //               };
// //               stateStats[stateName].count += 1;
// //             }

// //             stateStats[stateName].revenue += amount;
// //             stateStats[stateName].clientsMap[pId].value += amount;

// //             if (line.product_id) {
// //               const prodId = line.product_id[0];
// //               const prodName = line.product_id[1];

// //               if (!stateStats[stateName].clientsMap[pId].productsMap[prodId]) {
// //                 stateStats[stateName].clientsMap[pId].productsMap[prodId] = {
// //                   id: prodId,
// //                   product: prodName,
// //                   quantity: 0,
// //                   total: 0,
// //                 };
// //               }

// //               stateStats[stateName].clientsMap[pId].productsMap[
// //                 prodId
// //               ].quantity += line.quantity || 0;
// //               stateStats[stateName].clientsMap[pId].productsMap[prodId].total +=
// //                 amount;
// //             }
// //           });

// //           Object.keys(stateStats).forEach((stateKey) => {
// //             const stateObj = stateStats[stateKey];
// //             stateObj.clients = Object.values(stateObj.clientsMap).map(
// //               (cl: any) => {
// //                 cl.products = Object.values(cl.productsMap).sort(
// //                   (a: any, b: any) => b.total - a.total,
// //                 );
// //                 delete cl.productsMap;
// //                 return cl;
// //               },
// //             );
// //             delete stateObj.clientsMap;
// //           });
// //         }
// //       }
// //     } else {
// //       // 4. ENFOQUE HISTÓRICO TOTAL
// //       const partnerDomain: any[] = [
// //         ["id", "in", countryPartners],
// //         ["state_id", "!=", false],
// //       ];

// //       if (vendorId && vendorId !== "all") {
// //         partnerDomain.push(["user_id", "=", parseInt(vendorId)]);
// //       }

// //       const clients =
// //         (await callOdooRPC<any[]>("res.partner", "search_read", [
// //           partnerDomain,
// //           ["name", "state_id", "city", "vat", "total_invoiced", "user_id"],
// //         ])) || [];

// //       totalClientsCount = clients.length;

// //       clients.forEach((client) => {
// //         const stateName = client.state_id[1]
// //           .split("(")[0]
// //           .trim()
// //           .toUpperCase()
// //           .normalize("NFD")
// //           .replace(/[\u0300-\u036f]/g, "");

// //         if (!stateStats[stateName]) {
// //           stateStats[stateName] = {
// //             count: 0,
// //             revenue: 0,
// //             clients: [],
// //             original_name: client.state_id[1],
// //           };
// //         }

// //         const value = client.total_invoiced || 0;
// //         stateStats[stateName].count += 1;
// //         stateStats[stateName].revenue += value;
// //         stateStats[stateName].clients.push({
// //           name: client.name,
// //           city: client.city || "N/A",
// //           rif: client.vat || "N/A",
// //           seller_name: client.user_id ? client.user_id[1] : "N/A",
// //           value: value,
// //           products: [],
// //         });
// //       });
// //     }

// //     const summary = Object.entries(stateStats).map(([state, data]) => ({
// //       state: data.original_name,
// //       state_key: state,
// //       count: data.count,
// //       revenue: data.revenue,
// //       clients: (data.clients || []).sort((a: any, b: any) => b.value - a.value),
// //     }));

// //     return NextResponse.json({
// //       summary,
// //       total_clients: totalClientsCount,
// //       sellers,
// //       currency: "USD",
// //     });
// //   } catch (error: any) {
// //     return NextResponse.json({ error: error.message }, { status: 500 });
// //   }
// // }
// import { callOdooRPC } from "@/lib/odoo";
// import { NextResponse } from "next/server";

// export async function GET(request: Request) {
//   try {
//     const { searchParams } = new URL(request.url);
//     const countryCode = searchParams.get("country") || "VE";
//     const vendorId = searchParams.get("vendor_id");
//     const startDate = searchParams.get("startDate");
//     const endDate = searchParams.get("endDate");

//     // 1. OBTENER ÚNICAMENTE VENDEDORES ASOCIADOS A FACTURAS (Solución al Select vacío)
//     // Buscamos todas las facturas de clientes validadas que tengan un comercial asignado
//     const activeMovesWithSellers =
//       (await callOdooRPC<any[]>("account.move", "search_read", [
//         [
//           ["state", "=", "posted"],
//           ["move_type", "=", "out_invoice"],
//           ["user_id", "!=", false],
//         ],
//         ["user_id"],
//       ])) || [];

//     // Filtramos y eliminamos duplicados en memoria usando un Map para extraer { id, name } únicos
//     const sellersMap = new Map();
//     activeMovesWithSellers.forEach((move) => {
//       if (move.user_id && Array.isArray(move.user_id)) {
//         const [id, name] = move.user_id;
//         if (!sellersMap.has(id)) {
//           sellersMap.set(id, { id, name });
//         }
//       }
//     });

//     const sellers = Array.from(sellersMap.values()).sort((a, b) =>
//       a.name.localeCompare(b.name),
//     );

//     const hasDateFilter = startDate && endDate;
//     const stateStats: Record<string, any> = {};
//     let totalClientsCount = 0;

//     // 2. BUSCAR COMPAÑÍAS DEL PAÍS SELECCIONADO
//     const countryPartners =
//       (await callOdooRPC<any[]>("res.partner", "search", [
//         [
//           ["is_company", "=", true],
//           ["country_id.code", "=", countryCode],
//         ],
//       ])) || [];

//     if (!countryPartners.length) {
//       return NextResponse.json({
//         summary: [],
//         total_clients: 0,
//         sellers,
//         currency: "USD",
//       });
//     }

//     if (hasDateFilter) {
//       // 3. ENFOQUE POR FECHAS: CONSULTA DOBLE
//       const moveDomain: any[] = [
//         ["state", "=", "posted"],
//         ["move_type", "=", "out_invoice"],
//         ["invoice_date", ">=", startDate],
//         ["invoice_date", "<=", endDate],
//         ["partner_id", "in", countryPartners],
//       ];

//       if (vendorId && vendorId !== "all") {
//         moveDomain.push(["user_id", "=", parseInt(vendorId)]);
//       }

//       const moves =
//         (await callOdooRPC<any[]>("account.move", "search_read", [
//           moveDomain,
//           ["id", "user_id"],
//         ])) || [];

//       if (moves.length > 0) {
//         const moveIds = moves.map((m) => m.id);

//         const moveSellerMap: Record<number, string> = {};
//         moves.forEach((m) => {
//           moveSellerMap[m.id] = m.user_id ? m.user_id[1] : "N/A";
//         });

//         const invoiceLines =
//           (await callOdooRPC<any[]>("account.move.line", "search_read", [
//             [
//               ["move_id", "in", moveIds],
//               ["display_type", "=", "product"],
//             ],
//             [
//               "partner_id",
//               "price_subtotal",
//               "product_id",
//               "quantity",
//               "move_id",
//             ],
//           ])) || [];

//         const partnerIds = Array.from(
//           new Set(invoiceLines.map((line) => line.partner_id[0])),
//         );

//         if (partnerIds.length > 0) {
//           const clientsInfo =
//             (await callOdooRPC<any[]>("res.partner", "search_read", [
//               [
//                 ["id", "in", partnerIds],
//                 ["state_id", "!=", false],
//               ],
//               ["name", "state_id", "city", "vat"],
//             ])) || [];

//           totalClientsCount = clientsInfo.length;
//           const clientsMap: Record<number, any> = {};
//           clientsInfo.forEach((c) => {
//             clientsMap[c.id] = c;
//           });

//           invoiceLines.forEach((line) => {
//             const pId = line.partner_id[0];
//             const client = clientsMap[pId];
//             if (!client) return;

//             const mId = line.move_id[0];
//             const amount = line.price_subtotal || 0;

//             const stateName = client.state_id[1]
//               .split("(")[0]
//               .trim()
//               .toUpperCase()
//               .normalize("NFD")
//               .replace(/[\u0300-\u036f]/g, "");

//             if (!stateStats[stateName]) {
//               stateStats[stateName] = {
//                 count: 0,
//                 revenue: 0,
//                 clientsMap: {},
//                 original_name: client.state_id[1],
//               };
//             }

//             if (!stateStats[stateName].clientsMap[pId]) {
//               stateStats[stateName].clientsMap[pId] = {
//                 name: client.name,
//                 city: client.city || "N/A",
//                 rif: client.vat || "N/A",
//                 seller_name: moveSellerMap[mId] || "N/A",
//                 value: 0,
//                 productsMap: {},
//               };
//               stateStats[stateName].count += 1;
//             }

//             stateStats[stateName].revenue += amount;
//             stateStats[stateName].clientsMap[pId].value += amount;

//             if (line.product_id) {
//               const prodId = line.product_id[0];
//               const prodName = line.product_id[1];

//               if (!stateStats[stateName].clientsMap[pId].productsMap[prodId]) {
//                 stateStats[stateName].clientsMap[pId].productsMap[prodId] = {
//                   id: prodId,
//                   product: prodName,
//                   quantity: 0,
//                   total: 0,
//                 };
//               }

//               stateStats[stateName].clientsMap[pId].productsMap[
//                 prodId
//               ].quantity += line.quantity || 0;
//               stateStats[stateName].clientsMap[pId].productsMap[prodId].total +=
//                 amount;
//             }
//           });

//           Object.keys(stateStats).forEach((stateKey) => {
//             const stateObj = stateStats[stateKey];
//             stateObj.clients = Object.values(stateObj.clientsMap).map(
//               (cl: any) => {
//                 cl.products = Object.values(cl.productsMap).sort(
//                   (a: any, b: any) => b.total - a.total,
//                 );
//                 delete cl.productsMap;
//                 return cl;
//               },
//             );
//             delete stateObj.clientsMap;
//           });
//         }
//       }
//     } else {
//       // 4. ENFOQUE HISTÓRICO TOTAL
//       const partnerDomain: any[] = [
//         ["id", "in", countryPartners],
//         ["state_id", "!=", false],
//       ];

//       if (vendorId && vendorId !== "all") {
//         partnerDomain.push(["user_id", "=", parseInt(vendorId)]);
//       }

//       const clients =
//         (await callOdooRPC<any[]>("res.partner", "search_read", [
//           partnerDomain,
//           ["name", "state_id", "city", "vat", "total_invoiced", "user_id"],
//         ])) || [];

//       totalClientsCount = clients.length;

//       clients.forEach((client) => {
//         const stateName = client.state_id[1]
//           .split("(")[0]
//           .trim()
//           .toUpperCase()
//           .normalize("NFD")
//           .replace(/[\u0300-\u036f]/g, "");

//         if (!stateStats[stateName]) {
//           stateStats[stateName] = {
//             count: 0,
//             revenue: 0,
//             clients: [],
//             original_name: client.state_id[1],
//           };
//         }

//         const value = client.total_invoiced || 0;
//         stateStats[stateName].count += 1;
//         stateStats[stateName].revenue += value;
//         stateStats[stateName].clients.push({
//           name: client.name,
//           city: client.city || "N/A",
//           rif: client.vat || "N/A",
//           seller_name: client.user_id ? client.user_id[1] : "N/A",
//           value: value,
//           products: [],
//         });
//       });
//     }

//     const summary = Object.entries(stateStats).map(([state, data]) => ({
//       state: data.original_name,
//       state_key: state,
//       count: data.count,
//       revenue: data.revenue,
//       clients: (data.clients || []).sort((a: any, b: any) => b.value - a.value),
//     }));

//     return NextResponse.json({
//       summary,
//       total_clients: totalClientsCount,
//       sellers,
//       currency: "USD",
//     });
//   } catch (error: any) {
//     return NextResponse.json({ error: error.message }, { status: 500 });
//   }
// }
import { callOdooRPC } from "@/lib/odoo";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const countryCode = searchParams.get("country") || "VE";
    const vendorId = searchParams.get("vendor_id");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    // 1. OBTENER ÚNICAMENTE VENDEDORES ASOCIADOS A FACTURAS ACTIVAS
    const activeMovesWithSellers =
      (await callOdooRPC<any[]>("account.move", "search_read", [
        [
          ["state", "=", "posted"],
          ["move_type", "=", "out_invoice"],
          ["user_id", "!=", false],
        ],
        ["user_id"],
      ])) || [];

    const sellersMap = new Map();
    activeMovesWithSellers.forEach((move) => {
      if (move.user_id && Array.isArray(move.user_id)) {
        const [id, name] = move.user_id;
        if (!sellersMap.has(id)) {
          sellersMap.set(id, { id, name });
        }
      }
    });

    const sellers = Array.from(sellersMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const hasDateFilter = startDate && endDate;
    const stateStats: Record<string, any> = {};
    let totalClientsCount = 0;

    // 2. BUSCAR COMPAÑÍAS DEL PAÍS SELECCIONADO
    const countryPartners =
      (await callOdooRPC<any[]>("res.partner", "search", [
        [
          ["is_company", "=", true],
          ["country_id.code", "=", countryCode],
        ],
      ])) || [];

    if (!countryPartners.length) {
      return NextResponse.json({
        summary: [],
        total_clients: 0,
        sellers,
        currency: "USD",
      });
    }

    if (hasDateFilter) {
      // 3. ENFOQUE POR FECHAS: CONSULTA CON FILTRO TEMPORAL
      const moveDomain: any[] = [
        ["state", "=", "posted"],
        ["move_type", "=", "out_invoice"],
        ["invoice_date", ">=", startDate],
        ["invoice_date", "<=", endDate],
        ["partner_id", "in", countryPartners],
      ];

      if (vendorId && vendorId !== "all") {
        moveDomain.push(["user_id", "=", parseInt(vendorId)]);
      }

      const moves =
        (await callOdooRPC<any[]>("account.move", "search_read", [
          moveDomain,
          ["id", "user_id"],
        ])) || [];

      if (moves.length > 0) {
        const moveIds = moves.map((m) => m.id);

        const moveSellerMap: Record<number, string> = {};
        moves.forEach((m) => {
          moveSellerMap[m.id] = m.user_id ? m.user_id[1] : "N/A";
        });

        const invoiceLines =
          (await callOdooRPC<any[]>("account.move.line", "search_read", [
            [
              ["move_id", "in", moveIds],
              ["display_type", "=", "product"],
            ],
            [
              "partner_id",
              "price_subtotal",
              "product_id",
              "quantity",
              "move_id",
            ],
          ])) || [];

        const partnerIds = Array.from(
          new Set(invoiceLines.map((line) => line.partner_id[0])),
        );

        if (partnerIds.length > 0) {
          const clientsInfo =
            (await callOdooRPC<any[]>("res.partner", "search_read", [
              [
                ["id", "in", partnerIds],
                ["state_id", "!=", false],
              ],
              ["name", "state_id", "city", "vat"],
            ])) || [];

          totalClientsCount = clientsInfo.length;
          const clientsMap: Record<number, any> = {};
          clientsInfo.forEach((c) => {
            clientsMap[c.id] = c;
          });

          invoiceLines.forEach((line) => {
            const pId = line.partner_id[0];
            const client = clientsMap[pId];
            if (!client) return;

            const mId = line.move_id[0];
            const amount = line.price_subtotal || 0;

            const stateName = client.state_id[1]
              .split("(")[0]
              .trim()
              .toUpperCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");

            if (!stateStats[stateName]) {
              stateStats[stateName] = {
                count: 0,
                revenue: 0,
                clientsMap: {},
                original_name: client.state_id[1],
              };
            }

            if (!stateStats[stateName].clientsMap[pId]) {
              stateStats[stateName].clientsMap[pId] = {
                name: client.name,
                city: client.city || "N/A",
                rif: client.vat || "N/A",
                seller_name: moveSellerMap[mId] || "N/A",
                value: 0,
                productsMap: {},
              };
              stateStats[stateName].count += 1;
            }

            stateStats[stateName].revenue += amount;
            stateStats[stateName].clientsMap[pId].value += amount;

            if (line.product_id) {
              const prodId = line.product_id[0];
              const prodName = line.product_id[1];

              if (!stateStats[stateName].clientsMap[pId].productsMap[prodId]) {
                stateStats[stateName].clientsMap[pId].productsMap[prodId] = {
                  id: prodId,
                  product: prodName,
                  quantity: 0,
                  total: 0,
                };
              }

              stateStats[stateName].clientsMap[pId].productsMap[
                prodId
              ].quantity += line.quantity || 0;
              stateStats[stateName].clientsMap[pId].productsMap[prodId].total +=
                amount;
            }
          });

          Object.keys(stateStats).forEach((stateKey) => {
            const stateObj = stateStats[stateKey];
            stateObj.clients = Object.values(stateObj.clientsMap).map(
              (cl: any) => {
                cl.products = Object.values(cl.productsMap).sort(
                  (a: any, b: any) => b.total - a.total,
                );
                delete cl.productsMap;
                return cl;
              },
            );
            delete stateObj.clientsMap;
          });
        }
      }
    } else {
      // 4. ENFOQUE HISTÓRICO TOTAL RESOLVIDO: Extraemos líneas completas sin rango de fechas
      const moveDomain: any[] = [
        ["state", "=", "posted"],
        ["move_type", "=", "out_invoice"],
        ["partner_id", "in", countryPartners],
      ];

      if (vendorId && vendorId !== "all") {
        moveDomain.push(["user_id", "=", parseInt(vendorId)]);
      }

      const moves =
        (await callOdooRPC<any[]>("account.move", "search_read", [
          moveDomain,
          ["id", "user_id"],
        ])) || [];

      if (moves.length > 0) {
        const moveIds = moves.map((m) => m.id);

        const moveSellerMap: Record<number, string> = {};
        moves.forEach((m) => {
          moveSellerMap[m.id] = m.user_id ? m.user_id[1] : "N/A";
        });

        // Buscamos todas las líneas históricas asociadas a estas facturas
        const invoiceLines =
          (await callOdooRPC<any[]>("account.move.line", "search_read", [
            [
              ["move_id", "in", moveIds],
              ["display_type", "=", "product"],
            ],
            [
              "partner_id",
              "price_subtotal",
              "product_id",
              "quantity",
              "move_id",
            ],
          ])) || [];

        const partnerIds = Array.from(
          new Set(invoiceLines.map((line) => line.partner_id[0])),
        );

        if (partnerIds.length > 0) {
          const clientsInfo =
            (await callOdooRPC<any[]>("res.partner", "search_read", [
              [
                ["id", "in", partnerIds],
                ["state_id", "!=", false],
              ],
              ["name", "state_id", "city", "vat"],
            ])) || [];

          totalClientsCount = clientsInfo.length;
          const clientsMap: Record<number, any> = {};
          clientsInfo.forEach((c) => {
            clientsMap[c.id] = c;
          });

          invoiceLines.forEach((line) => {
            const pId = line.partner_id[0];
            const client = clientsMap[pId];
            if (!client) return;

            const mId = line.move_id[0];
            const amount = line.price_subtotal || 0;

            const stateName = client.state_id[1]
              .split("(")[0]
              .trim()
              .toUpperCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "");

            if (!stateStats[stateName]) {
              stateStats[stateName] = {
                count: 0,
                revenue: 0,
                clientsMap: {},
                original_name: client.state_id[1],
              };
            }

            if (!stateStats[stateName].clientsMap[pId]) {
              stateStats[stateName].clientsMap[pId] = {
                name: client.name,
                city: client.city || "N/A",
                rif: client.vat || "N/A",
                seller_name: moveSellerMap[mId] || "N/A",
                value: 0,
                productsMap: {},
              };
              stateStats[stateName].count += 1;
            }

            stateStats[stateName].revenue += amount;
            stateStats[stateName].clientsMap[pId].value += amount;

            if (line.product_id) {
              const prodId = line.product_id[0];
              const prodName = line.product_id[1];

              if (!stateStats[stateName].clientsMap[pId].productsMap[prodId]) {
                stateStats[stateName].clientsMap[pId].productsMap[prodId] = {
                  id: prodId,
                  product: prodName,
                  quantity: 0,
                  total: 0,
                };
              }

              stateStats[stateName].clientsMap[pId].productsMap[
                prodId
              ].quantity += line.quantity || 0;
              stateStats[stateName].clientsMap[pId].productsMap[prodId].total +=
                amount;
            }
          });

          Object.keys(stateStats).forEach((stateKey) => {
            const stateObj = stateStats[stateKey];
            stateObj.clients = Object.values(stateObj.clientsMap).map(
              (cl: any) => {
                cl.products = Object.values(cl.productsMap).sort(
                  (a: any, b: any) => b.total - a.total,
                );
                delete cl.productsMap;
                return cl;
              },
            );
            delete stateObj.clientsMap;
          });
        }
      }
    }

    const summary = Object.entries(stateStats).map(([state, data]) => ({
      state: data.original_name,
      state_key: state,
      count: data.count,
      revenue: data.revenue,
      clients: (data.clients || []).sort((a: any, b: any) => b.value - a.value),
    }));

    return NextResponse.json({
      summary,
      total_clients: totalClientsCount,
      sellers,
      currency: "USD",
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
