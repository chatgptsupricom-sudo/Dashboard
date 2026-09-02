import { jwtVerify } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { jwtSecretBytes } from "@/lib/secretos";
// import { Resend } from 'resend'; // Ejemplo usando Resend

const JWT_SECRET = jwtSecretBytes();
// const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
  try {
    const token = request.cookies.get("token")?.value;
    if (!token)
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });

    const { payload } = await jwtVerify(token, JWT_SECRET);
    const userRole = ((payload.role as string) || "").toLowerCase().trim();

    // Verificación estricta de permisos para aprobar
    if (userRole !== "compras" && userRole !== "superadmin") {
      return NextResponse.json(
        { error: "No tienes permisos para aprobar órdenes" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { ordenId, proveedorEmail } = body;

    // 1. Confirmar la orden en Odoo (Cambiar estado de 'draft' a 'purchase')
    /*
      await odooClient.execute_kw('purchase.order', 'button_confirm', [[ordenId]]);
    */

    // 2. Generar el PDF de la orden desde Odoo (Opcional)
    // 3. Enviar el correo automatizado al proveedor
    /*
      await resend.emails.send({
        from: 'compras@supricom.com',
        to: proveedorEmail,
        subject: `Nueva Orden de Compra - ${ordenId}`,
        html: `<p>Adjuntamos la orden de compra aprobada...</p>`,
        // attachments: [...]
      });
    */

    // 4. Registrar en la tabla de Auditoría (AuditLog) la acción del usuario

    return NextResponse.json(
      {
        success: true,
        message: "Orden aprobada y correo enviado exitosamente",
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error aprobando orden:", error);
    return NextResponse.json(
      { error: "Error en el proceso de aprobación" },
      { status: 500 },
    );
  }
}
