import { callOdooRPC } from "@/lib/odoo";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const companyId = url.searchParams.get("company_id") || "9";

    // 1. Get a sample of products
    const products = (await callOdooRPC<any[]>(
      "product.product",
      "search_read",
      [[["active", "=", true]]],
      { fields: ["id", "name", "product_tmpl_id"], limit: 5 }
    )) || [];

    const tmplIds = products.map((p: any) => p.product_tmpl_id?.[0]).filter(Boolean);

    // 2. Get templates with ALL fields (no field filter)
    const templates = (await callOdooRPC<any[]>(
      "product.template",
      "search_read",
      [[["id", "in", tmplIds]]],
      { limit: 3 }
    )) || [];

    // 3. Check for brand-related fields
    const allFields = templates.length > 0 ? Object.keys(templates[0]) : [];
    const brandFields = allFields.filter(f => 
      f.toLowerCase().includes("brand") || 
      f.toLowerCase().includes("marca") ||
      f.toLowerCase().includes("fabricante") ||
      f.toLowerCase().includes("manufacturer")
    );

    // 4. Try product.brand model
    let brandModel = null;
    try {
      brandModel = (await callOdooRPC<any[]>(
        "product.brand",
        "search_read",
        [[]],
        { fields: ["id", "name"], limit: 10 }
      )) || [];
    } catch (e: any) {
      brandModel = { error: e.message };
    }

    // 5. Try product.template fields_get for brand
    let fieldsGet = null;
    try {
      fieldsGet = await callOdooRPC<any>(
        "product.template",
        "fields_get",
        [],
        { attributes: ["string", "type", "help"] }
      );
      // Filter for brand-related fields
      const brandFieldsGet: Record<string, any> = {};
      Object.keys(fieldsGet).forEach(key => {
        if (key.toLowerCase().includes("brand") || key.toLowerCase().includes("marca")) {
          brandFieldsGet[key] = fieldsGet[key];
        }
      });
      fieldsGet = brandFieldsGet;
    } catch (e: any) {
      fieldsGet = { error: e.message };
    }

    return NextResponse.json({
      success: true,
      data: {
        sampleProducts: products,
        sampleTemplates: templates.map(t => ({
          id: t.id,
          name: t.name,
          brand_id: t.brand_id,
          // Show all fields that might be brand-related
          ...Object.fromEntries(
            Object.entries(t).filter(([k]) => 
              k.toLowerCase().includes("brand") || 
              k.toLowerCase().includes("marca")
            )
          )
        })),
        allTemplateFields: allFields,
        brandRelatedFields: brandFields,
        productBrandModel: brandModel,
        fieldsGetBrandFields: fieldsGet,
      },
    });
  } catch (error: any) {
    console.error("Error in debug:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
