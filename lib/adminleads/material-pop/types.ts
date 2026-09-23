export type PopLocation = "office" | "warehouse";

export type PopMovementType = "entry" | "exit" | "transfer" | "adjustment";

export const POP_LOCATION_LABELS: Record<PopLocation, string> = {
  office: "Oficina",
  warehouse: "Almacén",
};

export const POP_MOVEMENT_LABELS: Record<PopMovementType, string> = {
  entry: "Entrada",
  exit: "Salida",
  transfer: "Transferencia",
  adjustment: "Ajuste",
};

export interface PopCategory {
  id: number;
  name: string;
  cids: number | null;
}

export interface PopUom {
  id: number;
  name: string;
  allows_decimal: boolean | number;
  cids: number | null;
}

export interface PopProduct {
  id: number;
  code: string;
  name: string;
  category_id: number | null;
  category_name: string | null;
  uom_id: number | null;
  uom_name: string | null;
  uom_allows_decimal: boolean | number;
  brand: string | null;
  description: string | null;
  image_id: number | null;
  image_url: string | null;
  is_active: number;
  cids: number | null;
  stock_office: number;
  stock_warehouse: number;
  stock_total: number;
  /** Comprometido en solicitudes aprobadas sin entregar. */
  stock_reserved: number;
  /** stock_total menos lo reservado: lo que se puede comprometer hoy. */
  stock_available: number;
  has_alert: boolean;
  created_at: string;
}

export interface PopMovement {
  id: number;
  movement_group_id: string | null;
  type: PopMovementType;
  product_id: number;
  product_name?: string;
  product_code?: string;
  location: PopLocation | null;
  source_location: PopLocation | null;
  target_location: PopLocation | null;
  quantity: number;
  reason_type: string;
  reason_custom: string | null;
  client_id: number | null;
  client_name: string | null;
  destination: string | null;
  notes: string | null;
  created_by_name: string | null;
  cids: number | null;
  movement_date: string;
  created_at: string;
}
